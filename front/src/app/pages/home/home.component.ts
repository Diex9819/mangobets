import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuinielaService } from '../../services/quiniela.service';
import { AuthService } from '../../services/auth.service';
import { Jornada, PosicionQuiniela, PronosticoParticipante } from '../../models/quiniela.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {

  posiciones: PosicionQuiniela[] = [];
  cargando = true;
  errorMessage = '';

  // 🏆 JORNADAS ACTIVAS (selector de quinielas; backend ya las ordena más reciente primero)
  jornadasActivas: Jornada[] = [];
  jornadaSeleccionadaId = '';
  cargandoJornadasActivas = false;

  // 💰 Premio acumulado (bolsa) de la jornada activa
  premio = 0;
  premioInput: number | null = null;
  editandoPremio = false;
  guardandoPremio = false;
  premioError = '';

  // 🗂️ Estado del modal de detalle de pronóstico de un participante
  mostrarDetalle = false;
  participanteSeleccionado: PosicionQuiniela | null = null;
  modalBloqueado = false;

  // ⏱️ Fecha/hora de inicio de la jornada (primer partido) para privacidad de picks
  private jornadaInicioMs: number | null = null;

  // 🔒 ¿El backend incluyó los picks detallados en esta respuesta? (admin || jornada iniciada)
  puedeVerPicks?: boolean;

  // 🆔 ID de la jornada activa (para actualizar el premio)
  jornadaId = '';

  constructor(
    private quinielaService: QuinielaService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.cargarJornadasActivas();
  }

  // 🏆 Cargar jornadas activas (selector de quinielas)
  cargarJornadasActivas() {
    this.cargandoJornadasActivas = true;

    this.quinielaService.getJornadasActivas().subscribe({
      next: (res) => {
        this.jornadasActivas = res.jornadas || [];
        // Default: la más reciente
        this.jornadaSeleccionadaId = this.jornadasActivas[0]?.id || '';
        this.cargandoJornadasActivas = false;
        this.cargarPosiciones();
      },
      error: () => {
        this.cargandoJornadasActivas = false;
        this.cargarPosiciones();
      }
    });
  }

  // 🔍 Seleccionar quiniela activa y mostrar su Tabla de Posiciones
  seleccionarJornada(jornadaId: string) {
    if (!jornadaId || jornadaId === this.jornadaSeleccionadaId) return;
    this.jornadaSeleccionadaId = jornadaId;
    this.cargarPosiciones(jornadaId);
  }

  get jornadaSeleccionadaNombre(): string {
    return this.jornadasActivas.find((j) => j.id === this.jornadaSeleccionadaId)?.nombre || '';
  }

  // 👑 ¿Es administrador? (habilita la edición manual de la bolsa)
  get isAdmin(): boolean {
    return this.authService.getUser()?.role === 'ADMIN';
  }

  // 🏆 Cargar tabla de posiciones de la jornada seleccionada (o activa por defecto)
  cargarPosiciones(jornadaId?: string) {
    this.cargando = true;
    this.errorMessage = '';

    const targetId = jornadaId || this.jornadaSeleccionadaId || undefined;

    this.quinielaService.getJornadaActiva({ jornadaId: targetId }).subscribe({
      next: (jornada) => {
        this.jornadaId = jornada.id;
        this.premio = jornada.premio ?? 0;

        // ⏱️ Determinar si la jornada ya inició (primer partido); seguro contra NaN
        const partidos = jornada.partidos || [];
        const tiempo = (p: { horario?: string; fechaInicio?: string } | undefined) => {
          const ms = new Date(p?.horario ?? p?.fechaInicio ?? '').getTime();
          return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
        };
        const primer = [...partidos].sort((a, b) => tiempo(a) - tiempo(b))[0];
        const inicioMs = primer ? new Date(primer.horario ?? primer.fechaInicio ?? '').getTime() : null;
        this.jornadaInicioMs = inicioMs !== null && !Number.isNaN(inicioMs) ? inicioMs : null;

        this.quinielaService.getPosiciones(jornada.id).subscribe({
          next: (res) => {
            // 🏆 backend envía `position`; compat `posicion`
            this.posiciones = res.position ?? res.posicion ?? [];
            this.puedeVerPicks = res.puedeVerPicks;
            this.cargando = false;
          },
          error: (err) => {
            this.cargando = false;
            this.errorMessage =
              err.error?.error || err.error?.message || 'Error al calcular las posiciones';
          }
        });
      },
      error: (err) => {
        this.cargando = false;
        this.errorMessage =
          err.error?.error || err.error?.message || 'No hay ninguna jornada activa';
      }
    });
  }

  // ✏️ Activar / desactivar el modo edición de la bolsa
  editarPremio() {
    this.editandoPremio = true;
    this.premioInput = this.premio;
    this.premioError = '';
  }

  // ❌ Cancelar edición de la bolsa
  cancelarEditarPremio() {
    this.editandoPremio = false;
    this.premioInput = null;
    this.premioError = '';
  }

  // 💰 Guardar el premio acumulado (solo admin)
  guardarPremio() {
    const valor = Number(this.premioInput);

    if (!this.jornadaId || !Number.isFinite(valor) || valor < 0) {
      this.premioError = 'Ingresá un monto válido (>= 0)';
      return;
    }

    this.guardandoPremio = true;
    this.premioError = '';

    this.quinielaService
      .actualizarPremio(this.jornadaId, valor)
      .subscribe({
        next: () => {
          this.premio = valor;
          this.guardandoPremio = false;
          this.editandoPremio = false;
          this.premioInput = null;
        },
        error: (err) => {
          this.guardandoPremio = false;
          this.premioError =
            err.error?.error || err.error?.message || 'Error al actualizar el premio';
        }
      });
  }

  // 🔍 Abrir detalle de pronóstico del participante (desde la tabla)
  abrirDetalleParticipante(p: PosicionQuiniela) {
    const admin = this.isAdmin;
    const inicio = this.jornadaInicioMs;

    // 🔒 Sincronizado con backend `puedeVerPicks`. Si el backend no lo envía, fallback local.
    const bloqueado =
      this.puedeVerPicks !== undefined
        ? !this.puedeVerPicks
        : !admin && inicio !== null && Date.now() < inicio;

    this.participanteSeleccionado = p;
    this.mostrarDetalle = true;
    this.modalBloqueado = bloqueado;
  }

  // ✖️ Cerrar modal de detalle
  cerrarDetalleParticipante() {
    this.mostrarDetalle = false;
    this.participanteSeleccionado = null;
    this.modalBloqueado = false;
  }

  // 📋 Pronósticos del participante seleccionado (con equipos y goles)
  get pronosticosDelParticipante(): PronosticoParticipante[] {
    return this.participanteSeleccionado?.pronosticos || [];
  }

  // 🗑️ ADMIN: eliminar participante de la tabla (mismo flujo que "Gestionar participantes")
  //    Usa identidad EXACTA: jornada seleccionada + userId + aliasKey. Confirma antes.
  eliminandoParticipante = false;

  eliminarParticipante(p: PosicionQuiniela) {
    if (!this.isAdmin || this.eliminandoParticipante) return;

    const jornadaId = this.jornadaId || this.jornadaSeleccionadaId;
    if (!jornadaId) return;

    const nombre = p.alias || p.userId || 'Anónimo';
    const puntos = p.puntos ?? 0;

    // ⚠️ Confirmación previa mostrando alias + puntos de la fila para no borrar al equivocado
    const confirmado = window.confirm(
      `¿Eliminar a "${nombre}" de esta jornada?\n` +
      `Puntos: ${puntos}\n\n` +
      `Se borrarán sus pronósticos asociados en esta jornada. No se puede deshacer.`
    );
    if (!confirmado) return;

    this.eliminandoParticipante = true;

    this.quinielaService
      .eliminarParticipante(jornadaId, {
        userId: p.userId ?? null,
        aliasKey: p.aliasKey ?? null
      })
      .subscribe({
        next: () => {
          this.eliminandoParticipante = false;
          // 🔄 Recargar la tabla para que el registro eliminado (p. ej. duplicado con 0 pts) desaparezca
          this.cargarPosiciones(jornadaId);
        },
        error: (err) => {
          this.eliminandoParticipante = false;
          this.errorMessage =
            err.error?.error || err.error?.message || 'Error al eliminar el participante';
        }
      });
  }
}
