import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../share/navbar/navbar.component';
import { QuinielaAdminComponent } from './quiniela-admin.component';
import { QuinielaService } from '../../services/quiniela.service';
import { AuthService } from '../../services/auth.service';
import {
  Jornada,
  MarcadorGoles,
  PartidoQuiniela,
  ParticipanteQuiniela,
  PosicionQuiniela,
  PronosticoBatchItem,
  PronosticoParticipante,
  ListarParticipantesResponse,
  ListarPosicionesResponse,
} from '../../models/quiniela.model';

// 📌 Clave de localStorage donde se guarda el alias del visitante
const ALIAS_KEY = 'quinielaAlias';

@Component({
  selector: 'app-quiniela',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, QuinielaAdminComponent],
  templateUrl: './quiniela.component.html',
  styleUrl: './quiniela.component.css',
})
export class QuinielaComponent implements OnInit {

  jornada: Jornada | null = null;
  cargando = true;
  guardando = false;
  errorMessage = '';
  aviso = '';

  // 🔒 ¿La jornada ya cerró? (bloqueo por horario del primer partido)
  bloqueada = false;

  // ✅ ¿La quiniela ya fue enviada formalmente? (flujo de 2 pasos: resumen → confirmar)
  enviada = false;

  // 📋 Participantes de la jornada (vista admin: aprobación de pagos)
  participantes: ParticipanteQuiniela[] = [];
  participantesError = '';
  participantesExito = '';

  // 🏆 Tabla de posiciones (leaderboard)
  posiciones: PosicionQuiniela[] = [];
  posicionesError = '';

  // 🎯 Borradores locales de marcadores (antes de enviarlos por lote)
  drafts: Record<string, MarcadorGoles> = {};

  // 📋 Estado del modal de resumen de la quiniela
  mostrarResumen = false;

  // 🗂️ Estado del modal de detalle de pronóstico de un participante
  mostrarDetalleParticipante = false;
  participanteSeleccionado: ParticipanteQuiniela | null = null;

  // 🗂️ Estado del modal de gestión de participantes (admin)
  mostrarGestionParticipantes = false;

  // 📋 Marcadores seleccionados para el resumen / envío
  resumenPartidos: {
    partidoId: string;
    local: string;
    visitante: string;
    golesLocal: number;
    golesVisita: number;
  }[] = [];

  // 🪪 Identidad del visitante
  alias = '';
  aliasInput = '';
  aliasError = '';
  mostrarFormAlias = false;

  // 🎯 Pronóstico pendiente de confirmar (espera el alias) → guarda el lote
  pendiente: { pronosticos: PronosticoBatchItem[]; alias: string } | null = null;

  constructor(
    private quinielaService: QuinielaService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.alias = localStorage.getItem(ALIAS_KEY) || '';
    this.cargarJornada();
  }

  // 👤 ¿Hay sesión iniciada?
  get haySesion(): boolean {
    return this.authService.isAuthenticated();
  }

  // 👤 Nombre del usuario con sesión (para mostrarlo en la cabecera)
  get nombreSesion(): string {
    return this.authService.getUser()?.name || '';
  }

  // 👑 ¿Es administrador? (habilita el panel de gestión de jornadas)
  get esAdmin(): boolean {
    return this.authService.getUser()?.role === 'ADMIN';
  }

  // 🔄 Se incrementa en cada recarga para que el panel de admin se sincronice
  refreshAdminKey = 0;

  // 📅 Cargar la jornada activa
  cargarJornada() {
    this.cargando = true;
    this.errorMessage = '';

    // Sin sesión se manda el alias para recuperar el propio pronóstico
    const alias = this.haySesion ? undefined : (this.alias || undefined);

    this.quinielaService.getJornadaActiva(alias).subscribe({
      next: (jornada) => {
        this.jornada = jornada;
        this.cargando = false;
        this.refreshAdminKey++;
        this.bloqueada = this.esJornadaCerrada(jornada);
        this.enviada = (jornada.partidos || []).some((p) => p.miPronostico?.enviado);

        if (this.esAdmin) {
          this.cargarParticipantes();
        }

        this.cargarPosiciones();
      },
      error: (err) => {
        this.cargando = false;
        this.jornada = null;
        this.refreshAdminKey++;
        this.errorMessage =
          err.error?.error || err.error?.message || 'No hay ninguna jornada activa';
      }
    });
  }

  // 🔒 ¿La jornada ya cerró? (bloqueo por horario del primer partido)
  private esJornadaCerrada(jornada: Jornada): boolean {
    const partidos = jornada?.partidos || [];

    if (!partidos.length) {
      return false;
    }

    // ⏱️ Primer partido de la jornada (el más próximo en el tiempo)
    const primerPartido = [...partidos].sort(
      (a, b) => new Date(a.horario).getTime() - new Date(b.horario).getTime()
    )[0];

    if (!primerPartido) {
      return false;
    }

    const inicio = new Date(primerPartido.horario).getTime();

    if (Number.isNaN(inicio)) {
      return false;
    }

    // 🔒 Cerrada cuando ya pasó el horario del primer partido
    return Date.now() > inicio;
  }

  // 🎯 Marcador efectivo de un partido: borrador local si existe, si no el pronóstico guardado
  marcadorActual(partido: PartidoQuiniela): MarcadorGoles {
    const draft = this.drafts[partido.id];

    if (draft) {
      return draft;
    }

    return partido.miPronostico || { golesLocal: 0, golesVisita: 0 };
  }

  // ✏️ Actualizar el marcador local SIN guardar en el servidor.
  // El guardado real ocurre por lote con el botón "💾 Guardar Quiniela".
  // Cada lado se actualiza de forma 100% independiente en su propio draft.
  actualizarGoles(partido: PartidoQuiniela, lado: 'L' | 'V', valor: number) {
    if (this.bloqueada) return; // la jornada ya cerró
    if (partido.resultadoOficial) return;

    const draft: MarcadorGoles = { ...(this.drafts[partido.id] || {}) };

    if (lado === 'L') {
      draft.golesLocal = valor;
    } else {
      draft.golesVisita = valor;
    }

    this.drafts[partido.id] = draft;
  }

  // 💾 Guardar TODA la quiniela (todos los partidos pronosticables) en un solo request
  guardarQuiniela(): void {
    if (this.guardando || this.bloqueada || this.enviada) return;
    if (!this.jornada) return;

    const hayAlgo = this.jornada.partidos.some(
      (p) => !p.resultadoOficial && (!!p.miPronostico || this.drafts[p.id])
    );

    if (!hayAlgo) {
      this.aviso = '✅ Sin pronósticos para guardar';
      return;
    }

    const pronosticos = this.jornada.partidos
      .filter((p) => !p.resultadoOficial)
      .map((p) => ({
        partidoId: p.id,
        golesLocal: this.marcadorActual(p).golesLocal,
        golesVisita: this.marcadorActual(p).golesVisita
      }));

    // 📋 Armamos el resumen de la quiniela (marcadores seleccionados)
    this.resumenPartidos = this.jornada.partidos
      .filter((p) => !p.resultadoOficial)
      .map((p) => ({
        partidoId: p.id,
        local: p.local,
        visitante: p.visitante,
        golesLocal: this.marcadorActual(p).golesLocal,
        golesVisita: this.marcadorActual(p).golesVisita
      }));

    // 🪪 Sin sesión y sin alias → primero se pide el alias
    if (!this.haySesion && !this.alias) {
      this.pendiente = { pronosticos, alias: '' };
      this.aliasInput = '';
      this.aliasError = '';
      this.mostrarFormAlias = true;
      return;
    }

    // 📋 Abrir el modal de resumen antes de confirmar el envío definitivo
    this.mostrarResumen = true;
  }

  // ✍️ Cerrar el resumen (volver al modo edición)
  cerrarResumen() {
    this.mostrarResumen = false;
  }

  // 🔍 Abrir el detalle de pronóstico de un participante (modal)
  abrirDetalleParticipante(part: ParticipanteQuiniela) {
    this.participanteSeleccionado = part;
    this.mostrarDetalleParticipante = true;
  }

  // ✖️ Cerrar el modal de detalle de pronóstico
  cerrarDetalleParticipante() {
    this.mostrarDetalleParticipante = false;
    this.participanteSeleccionado = null;
  }

  // 👑 Abrir el modal de gestión de participantes (admin)
  abrirGestionParticipantes() {
    this.mostrarGestionParticipantes = true;
  }

  // ✖️ Cerrar el modal de gestión de participantes (admin)
  cerrarGestionParticipantes() {
    this.mostrarGestionParticipantes = false;
  }

  // 🔢 Cantidad de solicitudes de pago pendientes (badge del botón admin)
  get solicitudesPendientes(): number {
    return this.participantes.filter((p) => p.estadoPago === 'PENDIENTE').length;
  }

  // 📋 Pronósticos del participante seleccionado (con equipos y goles)
  get pronosticosDelParticipante(): PronosticoParticipante[] {
    return this.participanteSeleccionado?.pronosticos || [];
  }

  // 🚀 Confirmar y enviar definitivamente → POST batch oficial
  confirmarYMandar() {
    const pronosticos = this.resumenPartidos.map((p) => ({
      partidoId: p.partidoId,
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita
    }));

    const alias = this.haySesion ? undefined : (this.alias || undefined);

    this.enviarPronosticosBatch(pronosticos, alias);
  }

  private enviarPronosticosBatch(
    pronosticos: PronosticoBatchItem[],
    alias?: string
  ) {
    this.guardando = true;
    this.errorMessage = '';
    this.aviso = '';

    this.quinielaService
      .guardarPronosticosBatch({ pronosticos, alias })
      .subscribe({
        next: (res) => {
          this.guardando = false;
          this.drafts = {};
          this.mostrarResumen = false;
          this.enviada = true;

          this.aviso = '✅ ¡Quiniela guardada con éxito!';

          // 🔄 Refleja los pronósticos guardados en la vista
          this.cargarJornada();
        },
        error: (err) => {
          this.guardando = false;

          this.errorMessage =
            err.error?.error || err.error?.message || 'Error al guardar la quiniela';
        }
      });
  }

  // 🪪 Confirmar el alias → guarda el lote de pronósticos que quedó pendiente
  confirmarAlias() {
    const alias = this.aliasInput.trim();

    if (!alias) {
      this.aliasError = 'Escribe un nombre o alias para identificar tu pronóstico';
      return;
    }

    if (alias.length > 40) {
      this.aliasError = 'El alias debe tener 40 caracteres o menos';
      return;
    }

    this.alias = alias;
    localStorage.setItem(ALIAS_KEY, alias);
    this.mostrarFormAlias = false;
    this.aliasError = '';

    const pendiente = this.pendiente;
    this.pendiente = null;

    if (pendiente) {
      // 💾 Envía el lote de pronósticos pendiente ya con el alias confirmado
      this.enviarPronosticosBatch(pendiente.pronosticos, alias);
    } else {
      this.cargarJornada();
    }
  }

  // 🔄 Cambiar el alias (sin ningún pronóstico pendiente)
  cambiarAlias() {
    this.aliasInput = this.alias;
    this.aliasError = '';
    this.pendiente = null;
    this.mostrarFormAlias = true;
  }

  // 👑 Cargar participantes de la jornada activa (con estado de pago)
  cargarParticipantes() {
    if (!this.jornada) {
      return;
    }

    this.quinielaService
      .listarParticipantes(this.jornada.id)
      .subscribe({
        next: (res) => {
          this.participantes = res.participantes || [];
        },
        error: (err) => {
          this.participantesError =
            err.error?.error || err.error?.message || 'Error al cargar los participantes';
        }
      });
  }

  // 👑 Aprobar / Rechazar participante (estado de pago)
  cambiarEstadoPago(part: ParticipanteQuiniela, estado: 'APROBADO' | 'RECHAZADO') {
    if (!this.jornada) {
      return;
    }

    this.quinielaService
      .aprobarParticipante(this.jornada.id, {
        userId: part.userId,
        aliasKey: part.aliasKey,
        estado
      })
      .subscribe({
        next: (res) => {
          // ✅ Feedback visual + recarga de la lista (quita de pendientes / pasa a aprobados)
          this.participantesExito =
            estado === 'APROBADO'
              ? '✅ Participante aprobado / pagado'
              : '❌ Participante rechazado';
          this.participantesError = '';
          this.cargarParticipantes();
        },
        error: (err) => {
          this.participantesError =
            err.error?.error || err.error?.message || 'Error al actualizar el estado del participante';
        }
      });
  }

  // 🏆 Cargar tabla de posiciones (leaderboard)
  cargarPosiciones() {
    if (!this.jornada) {
      return;
    }

    this.quinielaService
      .getPosiciones(this.jornada.id)
      .subscribe({
        next: (res) => {
          this.posiciones = res.posicion || [];
        },
        error: (err) => {
          this.posicionesError =
            err.error?.error || err.error?.message || 'Error al calcular las posiciones';
        }
      });
  }

  // ❌ Cancelar el formulario de alias
  cancelarAlias() {
    this.mostrarFormAlias = false;
    this.aliasError = '';
    this.pendiente = null;
  }

  // 📊 Datos derivados
  get totalPartidos(): number {
    return this.jornada?.partidos?.length ?? 0;
  }

  get totalPronosticados(): number {
    return (
      this.jornada?.partidos?.filter(
        (p) => !p.resultadoOficial && (!!p.miPronostico || !!this.drafts[p.id])
      ).length ?? 0
    );
  }

  // ✅ ¿El pronóstico (marcador exacto) coincidió con el resultado oficial?
  acerto(partido: PartidoQuiniela): boolean {
    const oficial = partido.resultadoOficial;
    const pronostico = partido.miPronostico;

    if (!oficial || !pronostico) return false;

    return (
      pronostico.golesLocal === oficial.golesLocal &&
      pronostico.golesVisita === oficial.golesVisita
    );
  }
}
