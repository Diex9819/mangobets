// ⚽ Marcador exacto de goles: local vs visitante
export interface MarcadorGoles {
  golesLocal: number;
  golesVisita: number;
  /** ✅ true cuando el pronóstico fue confirmado formalmente (flujo de 2 pasos) */
  enviado?: boolean;
  /** 💳 Estado de pago: PENDIENTE | APROBADO | RECHAZADO */
  estadoPago?: EstadoPago;
}

// 💳 Estados de pago de un participante
export type EstadoPago = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

export interface PartidoQuiniela {
  id: string;
  local: string;
  visitante: string;
  /** ⏰ inicio del partido (campo canónico: horario) */
  horario: string;
  /** 🏷️ alias de `horario` (por si el backend lo expone como fechaInicio) */
  fechaInicio?: string;
  /** ⛔ cierre manual por partido (admin); default false */
  cerrado?: boolean;
  /** 🔓 true si este partido acepta pronósticos ahora (calculado por backend) */
  puedePronosticar?: boolean;
  resultadoOficial: MarcadorGoles | null;
  miPronostico: MarcadorGoles | null;
  puntos?: number | null;
}

export interface Jornada {
  id: string;
  nombre: string;
  activa: boolean;
  /** 💰 Premio acumulado (bolsa) para la jornada */
  premio?: number;
  /** 🔓 interruptor manual de recepción (admin); default true */
  recepcionAbierta?: boolean;
  partidos: PartidoQuiniela[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ActualizarPremioResponse {
  success: boolean;
  message: string;
  premio: number;
}

export interface Pronostico {
  id: string;
  partidoId: string;
  golesLocal: number;
  golesVisita: number;
  alias?: string | null;
  actualizadoEn: string;
}

export interface GuardarPronosticoPayload {
  partidoId: string;
  golesLocal: number;
  golesVisita: number;
  /** 👤 Alias: obligatorio solo si no hay sesión iniciada */
  alias?: string;
}

export interface GuardarPronosticoResponse {
  success: boolean;
  creado: boolean;
  pronostico: Pronostico;
}

export interface PronosticoBatchItem {
  partidoId: string;
  golesLocal: number;
  golesVisita: number;
}

export interface GuardarPronosticosBatchPayload {
  pronosticos: PronosticoBatchItem[];
  alias?: string;
  /** 🆔 ID de la jornada activa a usar (por defecto: la más reciente activa) */
  jornadaId?: string;
}

export interface GuardarPronosticosBatchResponse {
  success: boolean;
  guardados: number;
  creados: number;
  pronosticos: Pronostico[];
}

/** 🏆 Lista de jornadas activas (selector de quinielas) */
export interface ListarJornadasActivasResponse {
  success: boolean;
  jornadas: Jornada[];
}

export interface PronosticoParticipante {
  partidoId: string;
  golesLocal: number;
  golesVisita: number;
  /** ⚽ Equipos del partido pronosticado (para el detalle del modal) */
  local: string | null;
  visitante: string | null;
  enviado: boolean;
  estadoPago: EstadoPago;
}

export interface ParticipanteQuiniela {
  userId: string | null;
  alias: string | null;
  aliasKey: string | null;
  estadoPago: EstadoPago;
  pronosticos: PronosticoParticipante[];
}

export interface ListarParticipantesResponse {
  success: boolean;
  jornadaId: string;
  participantes: ParticipanteQuiniela[];
}

export interface PosicionQuiniela extends ParticipanteQuiniela {
  puntos: number;
  aciertosExactos: number;
  resultados: number;
}

export interface ListarPosicionesResponse {
  success: boolean;
  jornadaId: string;
  posicion: PosicionQuiniela[];
}

// =====================
// 👑 ADMIN
// =====================

export interface PartidoInput {
  local: string;
  visitante: string;
  /** ⏰ inicio del partido (canónico) */
  horario: string;
  /** 🏷️ alias de horario */
  fechaInicio?: string;
  resultadoOficial?: MarcadorGoles | null;
  /** ⛔ cierre manual por partido; default false */
  cerrado?: boolean;
}

export interface CrearJornadaPayload {
  nombre: string;
  activa: boolean;
  partidos: PartidoInput[];
}

export interface EditarPartidoPayload {
  local?: string;
  visitante?: string;
  /** ⏰ inicio del partido (canónico) */
  horario?: string;
  /** 🏷️ alias de horario */
  fechaInicio?: string;
  /** ⛔ cierre manual por partido */
  cerrado?: boolean;
}

export interface EditarJornadaPartidoPayload {
  id: string;
  local?: string;
  visitante?: string;
  /** ⏰ inicio del partido (canónico) */
  horario?: string;
  /** 🏷️ alias de horario */
  fechaInicio?: string;
}

export interface EditarJornadaPayload {
  nombre?: string;
  activa?: boolean;
  /** 🔓 interruptor manual de recepción */
  recepcionAbierta?: boolean;
  partidos?: EditarJornadaPartidoPayload[];
}

export interface OperacionAdminResponse {
  success: boolean;
  message: string;
  pronosticosEliminados?: number;
}
