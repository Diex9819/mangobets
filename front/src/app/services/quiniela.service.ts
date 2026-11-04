import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';
import { AuthService } from './auth.service';
import {
  CrearJornadaPayload,
  EditarPartidoPayload,
  GuardarPronosticoPayload,
  GuardarPronosticoResponse,
  GuardarPronosticosBatchPayload,
  GuardarPronosticosBatchResponse,
  Jornada,
  MarcadorGoles,
  OperacionAdminResponse,
  ListarParticipantesResponse,
  ListarPosicionesResponse,
} from '../models/quiniela.model';

/**
 * ⚽ SERVICIO DE QUINIELAS
 * Habla únicamente con /api/quinielas.
 *
 * El endpoint es PÚBLICO: se puede ver la jornada y pronosticar sin iniciar
 * sesión. Cuando no hay sesión, el alias identifica al prognosticador:
 *  - GET  → ?alias=<alias> para recuperar el propio pronóstico
 *  - POST → { partidoId, golesLocal, golesVisita, alias }
 *
 * Si hay sesión, el token se manda igual y el backend usa el userId.
 */
@Injectable({ providedIn: 'root' })
export class QuinielaService {

  private apiUrl = environment.apiUrl + '/quinielas';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  // 📅 JORNADA ACTIVA (con el pronóstico de quien consulta)
  getJornadaActiva(alias?: string): Observable<Jornada> {
    const query = alias ? `?alias=${encodeURIComponent(alias)}` : '';

    return this.http.get<Jornada>(`${this.apiUrl}/activa${query}`, {
      headers: this.authHeaders()
    });
  }

  // 🎯 GUARDAR / ACTUALIZAR PRONÓSTICO (marcador exacto: golesLocal vs golesVisita)
  // El alias solo se manda si no hay sesión (el backend lo ignora si la hay).
  guardarPronostico(
    partidoId: string,
    golesLocal: number,
    golesVisita: number,
    alias?: string
  ): Observable<GuardarPronosticoResponse> {
    const body: GuardarPronosticoPayload = {
      partidoId,
      golesLocal,
      golesVisita
    };

    if (alias && alias.trim()) {
      body.alias = alias.trim();
    }

    return this.http.post<GuardarPronosticoResponse>(
      `${this.apiUrl}/pronosticos`,
      body,
      { headers: this.authHeaders() }
    );
  }

  // 💾 GUARDAR LOTE DE PRONÓSTICOS (botón "📋 Ver Resumen de Quiniela")
  // Envía TODOS los pronósticos de la jornada en un solo request.
  // El alias solo se manda si no hay sesión (el backend lo ignora si la hay).
  guardarPronosticosBatch(
    payload: GuardarPronosticosBatchPayload
  ): Observable<GuardarPronosticosBatchResponse> {
    return this.http.post<GuardarPronosticosBatchResponse>(
      `${this.apiUrl}/pronosticos/batch`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // 👑 LISTAR PARTICIPANTES DE UNA JORNADA (con estado de pago)
  listarParticipantes(jornadaId: string): Observable<ListarParticipantesResponse> {
    return this.http.get<ListarParticipantesResponse>(
      `${this.apiUrl}/jornadas/${jornadaId}/participantes`,
      { headers: this.authHeaders() }
    );
  }

  // 🏆 LISTAR POSICIONES / LEADERBOARD (solo participantes con pago aprobado)
  getPosiciones(jornadaId: string): Observable<ListarPosicionesResponse> {
    return this.http.get<ListarPosicionesResponse>(
      `${this.apiUrl}/jornadas/${jornadaId}/posiciones`,
      { headers: this.authHeaders() }
    );
  }

  // 👑 APROBAR / RECHAZAR PARTICIPANTE (estado de pago)
  aprobarParticipante(
    jornadaId: string,
    data: { userId: string | null; aliasKey: string | null; estado: 'APROBADO' | 'RECHAZADO' }
  ): Observable<{ success: boolean; message: string; actualizados: number }> {
    return this.http.patch<{ success: boolean; message: string; actualizados: number }>(
      `${this.apiUrl}/jornadas/${jornadaId}/aprobar-participante`,
      data,
      { headers: this.authHeaders() }
    );
  }

  // 🔑 HEADERS con el token de autenticación (si hay sesión)
  private authHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    const token = this.authService.getToken();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  // =====================
  // 👑 ADMIN
  // =====================

  // 📋 Listar jornadas
  listarJornadas(): Observable<Jornada[]> {
    return this.http.get<Jornada[]>(`${this.apiUrl}/admin/jornadas`, {
      headers: this.authHeaders()
    });
  }

  // 🆕 Crear una jornada con sus partidos
  crearJornada(payload: CrearJornadaPayload): Observable<Jornada> {
    return this.http.post<Jornada>(`${this.apiUrl}/admin/jornadas`, payload, {
      headers: this.authHeaders()
    });
  }

  // ➕ Agregar un partido a una jornada existente
  agregarPartido(
    jornadaId: string,
    data: { local: string; visitante: string; horario: string }
  ): Observable<Jornada> {
    return this.http.post<Jornada>(
      `${this.apiUrl}/admin/jornadas/${jornadaId}/partidos`,
      data,
      { headers: this.authHeaders() }
    );
  }

  // 🟢 Activar una jornada
  activarJornada(jornadaId: string): Observable<Jornada> {
    return this.http.patch<Jornada>(
      `${this.apiUrl}/admin/jornadas/${jornadaId}/activar`,
      {},
      { headers: this.authHeaders() }
    );
  }

  // 🏁 Publicar el resultado oficial de un partido (marcador exacto)
  publicarResultado(
    jornadaId: string,
    partidoId: string,
    resultado: MarcadorGoles
  ): Observable<Jornada> {
    return this.http.patch<Jornada>(
      `${this.apiUrl}/admin/jornadas/${jornadaId}/partidos/${partidoId}/resultado`,
      { resultadoOficial: resultado },
      { headers: this.authHeaders() }
    );
  }

  // ✏️ Editar el nombre de una jornada
  editarJornada(jornadaId: string, nombre: string): Observable<Jornada> {
    return this.http.patch<Jornada>(
      `${this.apiUrl}/admin/jornadas/${jornadaId}`,
      { nombre },
      { headers: this.authHeaders() }
    );
  }

  // 🗑️ Eliminar una jornada
  eliminarJornada(jornadaId: string): Observable<OperacionAdminResponse> {
    return this.http.delete<OperacionAdminResponse>(
      `${this.apiUrl}/admin/jornadas/${jornadaId}`,
      { headers: this.authHeaders() }
    );
  }

  // ✏️ Editar un partido
  editarPartido(
    jornadaId: string,
    partidoId: string,
    data: EditarPartidoPayload
  ): Observable<Jornada> {
    return this.http.patch<Jornada>(
      `${this.apiUrl}/admin/jornadas/${jornadaId}/partidos/${partidoId}`,
      data,
      { headers: this.authHeaders() }
    );
  }

  // 🗑️ Eliminar un partido
  eliminarPartido(
    jornadaId: string,
    partidoId: string
  ): Observable<OperacionAdminResponse> {
    return this.http.delete<OperacionAdminResponse>(
      `${this.apiUrl}/admin/jornadas/${jornadaId}/partidos/${partidoId}`,
      { headers: this.authHeaders() }
    );
  }
}
