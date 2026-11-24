import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { QuinielaAdminComponent } from './quiniela-admin.component';
import { QuinielaService } from '../../services/quiniela.service';
import { AuthService } from '../../services/auth.service';
import {
  Jornada,
  MarcadorGoles,
  PartidoQuiniela,
  ParticipanteQuiniela,
  PronosticoBatchItem,
  ListarParticipantesResponse,
} from '../../models/quiniela.model';

// 📌 Clave de localStorage donde se guarda el alias del visitante
const ALIAS_KEY = 'quinielaAlias';

@Component({
  selector: 'app-quiniela',
  standalone: true,
  imports: [CommonModule, FormsModule, QuinielaAdminComponent],
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

  // ⚠️ Aviso de bloqueo: el usuario ya envió sus resultados y están bloqueados
  advertencia = '';

  // 📋 Participantes de la jornada (vista admin: aprobación de pagos)
  participantes: ParticipanteQuiniela[] = [];
  participantesError = '';
  participantesExito = '';

  // 🎯 Borradores locales de marcadores (antes de enviarlos por lote)
  drafts: Record<string, MarcadorGoles> = {};

  // 📋 Estado del modal de resumen de la quiniela
  mostrarResumen = false;

  // 🗂️ Estado del modal de gestión de participantes (admin)
  mostrarGestionParticipantes = false;

  // ✏️ Estado del modal para editar fechas / reactivar jornada (admin)
  mostrarEditorFechas = false;
  guardandoFechas = false;
  errorFechas = '';
  fechasForm: { id: string; local: string; visitante: string; horario: string }[] = [];

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

    // 🧹 Reset estado transitorio (aviso/errores/modal/drafts) en cada carga
    //    → evita que alertas o pronósticos de un usuario anterior se queden pegados
    this.aviso = '';
    this.mostrarResumen = false;
    this.resumenPartidos = [];
    this.drafts = {};
    this.pendiente = null;

    // Sin sesión se manda el alias para recuperar el propio pronóstico
    const alias = this.haySesion ? undefined : (this.alias || undefined);

    this.quinielaService.getJornadaActiva(alias).subscribe({
      next: (jornada) => {
        this.jornada = jornada;
        this.cargando = false;
        this.refreshAdminKey++;
        this.bloqueada = this.esJornadaCerrada(jornada);
        this.enviada = (jornada.partidos || []).some((p) => p.miPronostico?.enviado);

        // ⚠️ Si la jornada ya fue enviada por este usuario/alias → bloquear pronósticos
        if (this.enviada) {
          const ident = this.haySesion
            ? this.nombreSesion
            : this.alias;
          this.advertencia = `⚠️ El usuario ${ident || 'invitado'} ya envió sus resultados para esta jornada y están bloqueados.`;
        } else {
          this.advertencia = '';
        }

        if (this.esAdmin) {
          this.cargarParticipantes();
        }
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

  // 🎯 Marcador efectivo de un partido: borrador local si existe, si no el pronóstico guardado.
  // Lados que faltan quedan en 0: el pronóstico siempre se envía con un marcador completo y válido.
  marcadorActual(partido: PartidoQuiniela): MarcadorGoles {
    const draft = this.drafts[partido.id];

    return {
      golesLocal: this.golesSeguro(draft?.golesLocal ?? partido.miPronostico?.golesLocal),
      golesVisita: this.golesSeguro(draft?.golesVisita ?? partido.miPronostico?.golesVisita)
    };
  }

  // 🔢 Marcador seguro: entero >= 0. Valores raros, negativos o faltantes → 0.
  private golesSeguro(valor: number | null | undefined): number {
    const numero = Number(valor);

    if (!Number.isFinite(numero)) return 0;

    return Math.max(0, Math.floor(numero));
  }

  // ✏️ Actualizar el marcador local SIN guardar en el servidor.
  // El guardado real ocurre por lote con el botón "💾 Guardar Quiniela".
  // Cada lado se actualiza de forma 100% independiente en su propio draft.
  actualizarGoles(partido: PartidoQuiniela, lado: 'L' | 'V', valor: number) {
    if (this.bloqueada) return; // la jornada ya cerró
    if (this.enviada) return; // ya se envió → bloqueado
    if (partido.resultadoOficial) return;

    // 🔒 El borrador se completa: siempre almacenamos un marcador entero >= 0,
    //    aunque el usuario haya editado un solo lado o borrado un campo.
    const marcador = this.marcadorActual(partido);
    const draft: MarcadorGoles = {
      golesLocal: marcador.golesLocal,
      golesVisita: marcador.golesVisita
    };

    draft[lado === 'L' ? 'golesLocal' : 'golesVisita'] = this.golesSeguro(valor);

    this.drafts[partido.id] = draft;
  }

  // 💾 Guardar TODA la quiniela (todos los partidos pronosticables) en un solo request
  guardarQuiniela(): void {
    if (this.guardando) return;
    if (this.bloqueada) return;

    // 🔒 Bloqueo estricto: si ya se envió, no se permite reintentar
    if (this.enviada) {
      this.advertencia = `⚠️ El usuario ${this.haySesion ? this.nombreSesion : this.alias || 'invitado'} ya envió sus resultados para esta jornada y están bloqueados.`;
      return;
    }

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

  // 👑 Abrir el modal de gestión de participantes (admin)
  abrirGestionParticipantes() {
    this.mostrarGestionParticipantes = true;
  }

  // ✖️ Cerrar el modal de gestión de participantes (admin)
  cerrarGestionParticipantes() {
    this.mostrarGestionParticipantes = false;
  }

  // ✏️ Abrir editor de fechas / reactivar jornada (admin)
  abrirEditorFechas() {
    if (!this.jornada) return;

    this.fechasForm = (this.jornada.partidos || []).map((p) => ({
      id: p.id,
      local: p.local,
      visitante: p.visitante,
      horario: this.aDatetimeLocal(p.horario),
    }));
    this.errorFechas = '';
    this.mostrarEditorFechas = true;
  }

  cerrarEditorFechas() {
    this.mostrarEditorFechas = false;
    this.errorFechas = '';
  }

  guardarFechasJornada() {
    if (!this.jornada || this.guardandoFechas) return;

    const partidos = this.fechasForm.map((p) => ({
      id: p.id,
      horario: this.datetimeLocalAIso(p.horario),
    }));

    if (partidos.some((p) => !p.horario)) {
      this.errorFechas = 'Completá la fecha y hora de todos los partidos';
      return;
    }

    this.guardandoFechas = true;
    this.errorFechas = '';

    this.quinielaService
      .editarJornada(this.jornada.id, { activa: true, partidos })
      .subscribe({
        next: () => {
          this.guardandoFechas = false;
          this.mostrarEditorFechas = false;
          this.aviso = '✅ Jornada actualizada y reactivada. Ya se pueden recibir pronósticos.';
          this.cargarJornada();
        },
        error: (err) => {
          this.guardandoFechas = false;
          this.errorFechas =
            err.error?.error || err.error?.message || 'Error al actualizar las fechas de la jornada';
        },
      });
  }

  private aDatetimeLocal(iso: string): string {
    const fecha = new Date(iso);

    if (Number.isNaN(fecha.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');

    return (
      `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}` +
      `T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
    );
  }

  private datetimeLocalAIso(valor: string): string {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? valor : fecha.toISOString();
  }

  // 🔢 Cantidad de solicitudes de pago pendientes (badge del botón admin)
  get solicitudesPendientes(): number {
    return this.participantes.filter((p) => p.estadoPago === 'PENDIENTE').length;
  }

  // 🚀 Confirmar y enviar definitivamente → POST batch oficial
  confirmarYMandar() {
    const pronosticos = this.resumenPartidos.map((p) => ({
      partidoId: p.partidoId,
      golesLocal: this.golesSeguro(p.golesLocal),
      golesVisita: this.golesSeguro(p.golesVisita)
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

          // 🔄 Refleja los pronósticos guardados en la vista
          this.cargarJornada();

          // ✅ Aviso de éxito (después de la recarga para que cargarJornada no lo borre)
          this.aviso = '✅ ¡Quiniela guardada con éxito!';
          this.advertencia = ''; // ✅ Tras un envío exitoso ya no aplica bloqueo
        },
        error: (err) => {
          this.guardando = false;

          this.errorMessage = this.mensajeDeError(err);
        }
      });
  }

  // 📣 Traduce la respuesta del backend en un mensaje claro y descriptivo (español).
  // Si el backend devuelve un 422 con "Validation failed" + details, se muestran
  // los mensajes de cada campo; en otro caso se usa el mensaje del servidor o un
  // texto local. Nunca se muestra el "Validation failed" genérico.
  private mensajeDeError(err: HttpErrorResponse): string {
    const body = err?.error;

    if (body && typeof body === 'object') {
      // 🧾 Validación del backend: detalles descriptivos por campo
      if (Array.isArray(body.details) && body.details.length > 0) {
        const detalles = body.details
          .map((d: { field?: string; message?: string }) =>
            d?.message ? d.message : d?.field ? `${d.field}: dato inválido` : ''
          )
          .filter(Boolean)
          .join('; ');

        return detalles
          ? `Error de validación: ${detalles}`
          : 'Error de validación: datos inválidos';
      }

      const texto = typeof body.error === 'string' ? body.error : '';

      if (texto && texto !== 'Validation failed') return texto;
      if (typeof body.message === 'string' && body.message) return body.message;
      if (texto === 'Validation failed') {
        return 'Error de validación: campos requeridos o inválidos';
      }
    }

    if (typeof body === 'string' && body && body !== 'Validation failed') return body;

    return 'Error al guardar la quiniela';
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

    // 🧹 Al cambiar de usuario/alias: limpiar estado transitorio y pronósticos previos
    this.aviso = '';
    this.errorMessage = '';
    this.advertencia = '';
    this.mostrarResumen = false;
    this.resumenPartidos = [];
    this.drafts = {};
    this.enviada = false;
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
        next: () => {
          // ✅ Feedback visual + recarga de la lista (quita de pendientes / pasa a aprobados)
          this.participantesExito =
            estado === 'APROBADO'
              ? '✅ Participante aprobado / pagado'
              : '❌ Participante rechazado';
          this.participantesError = '';
          this.cargarParticipantes();
        },
        error: (err) => {
          this.participantesError = this.mensajeDeError(err);
        }
      });
  }

  // 🗑️ Eliminar participante de la jornada (borra sus pronósticos)
  eliminarParticipante(part: ParticipanteQuiniela) {
    if (!this.jornada) return;

    const nombre = part.alias || part.userId || 'Anónimo';
    const confirmado = window.confirm(
      `¿Eliminar a "${nombre}" de esta jornada? Se borrarán sus pronósticos asociados.`
    );
    if (!confirmado) return;

    this.quinielaService
      .eliminarParticipante(this.jornada.id, {
        userId: part.userId,
        aliasKey: part.aliasKey
      })
      .subscribe({
        next: () => {
          this.participantesExito = `🗑️ Participante "${nombre}" eliminado`;
          this.participantesError = '';
          this.cargarParticipantes();
        },
        error: (err) => {
          this.participantesError = this.mensajeDeError(err);
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

  // 🎯 Puntos obtenidos por el pronóstico (usa cálculo del backend si viene)
  puntosObtenidos(partido: PartidoQuiniela): number | null {
    if (partido.puntos !== undefined && partido.puntos !== null) {
      return partido.puntos;
    }

    const oficial = partido.resultadoOficial;
    const pronostico = partido.miPronostico;
    if (!oficial || !pronostico) return null;

    if (
      pronostico.golesLocal === oficial.golesLocal &&
      pronostico.golesVisita === oficial.golesVisita
    ) {
      return 2;
    }

    const signo = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);
    return signo(pronostico.golesLocal, pronostico.golesVisita) ===
      signo(oficial.golesLocal, oficial.golesVisita)
      ? 1
      : 0;
  }

  // ✅ ¿Coincidió el marcador exacto?
  aciertoExacto(partido: PartidoQuiniela): boolean {
    return this.puntosObtenidos(partido) === 2;
  }

  // 🟡 ¿Acertó al resultado/ganador (sin acertar el marcador exacto)?
  aciertoGanador(partido: PartidoQuiniela): boolean {
    return this.puntosObtenidos(partido) === 1;
  }
}
