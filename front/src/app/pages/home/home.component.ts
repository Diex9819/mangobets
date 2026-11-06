import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuinielaService } from '../../services/quiniela.service';
import { AuthService } from '../../services/auth.service';
import { PosicionQuiniela, PronosticoParticipante } from '../../models/quiniela.model';

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

  // 🆔 ID de la jornada activa (para actualizar el premio)
  jornadaId = '';

  constructor(
    private quinielaService: QuinielaService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.cargarPosiciones();
  }

  // 👑 ¿Es administrador? (habilita la edición manual de la bolsa)
  get isAdmin(): boolean {
    return this.authService.getUser()?.role === 'ADMIN';
  }

  // 🏆 Cargar tabla de posiciones (leaderboard) de la jornada activa
  cargarPosiciones() {
    this.cargando = true;
    this.errorMessage = '';

    this.quinielaService.getJornadaActiva().subscribe({
      next: (jornada) => {
        this.jornadaId = jornada.id;
        this.premio = jornada.premio ?? 0;

        // ⏱️ Determinar si la jornada ya inició (primer partido)
        const partidos = jornada.partidos || [];
        const primer = [...partidos].sort(
          (a, b) => new Date(a.horario).getTime() - new Date(b.horario).getTime()
        )[0];
        this.jornadaInicioMs = primer ? new Date(primer.horario).getTime() : null;

        this.quinielaService.getPosiciones(jornada.id).subscribe({
          next: (res) => {
            this.posiciones = res.posicion || [];
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
    const bloqueado = !admin && inicio !== null && Date.now() < inicio;

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
}
