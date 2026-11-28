// 🧹 Unifica un participante duplicado (por defecto "DIEX") dentro de una jornada.
//
//   - Inspecciona Pronostico en la(s) jornada(s) donde aparece el nombre dos o más veces.
//   - Elige como PRINCIPAL la identidad con MÁS PUNTOS (luego APROBADO, más picks, orden estable).
//     Garantiza NO tocar los 5 puntos ni los pronósticos buenos del principal.
//   - Mueve los picks de los partidos nuevos del duplicado (0 pts) a la identidad principal
//     SIN violar índices únicos: si el principal ya tiene pick en ese partido, NO se reasigna;
//     se elimina solo el documento duplicado sobrante.
//   - Borra ÚNICAMENTE documentos duplicados (por `_id`), nunca picks del principal.
//   - No altera `resultadoOficial`, `estadoPago`, `enviado`, `goles*`, `partidoId`, ni la jornada.
//
// Uso:
//   node scripts/unificarDiex.js [jornadaId] [nombre]
//   JORNADA_ID=... NOMBRE=diex node scripts/unificarDiex.js
//   DRY_RUN=1 node scripts/unificarDiex.js          (solo inspección, no escribe)
//
// Env: MONGODB_URI (default mongodb://localhost:27017/mangobets-db)

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { Jornada, Pronostico } from '../src/models/Quiniela.js';

// 📁 Cargar .env de back/ aunque se ejecute desde otra carpeta
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ───────────────────────── helpers ─────────────────────────

function nombreNormalizado(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim().toLowerCase() : null;
}

function nombreParticipante(p) {
  return nombreNormalizado(p?.aliasKey) || nombreNormalizado(p?.alias) || null;
}

function identidadKey(p) {
  const userId = p?.userId ? p.userId.toString() : 'anon';
  return `${userId}:${nombreParticipante(p) || ''}`;
}

// 📊 Puntos de un participante (misma lógica que listarPosiciones; solo resultadoOficial suma)
function puntosParticipante(pronosticos, partidosPorId) {
  let puntos = 0;
  let aciertosExactos = 0;
  let resultados = 0;

  for (const pr of pronosticos) {
    const partido = partidosPorId.get(pr.partidoId.toString());
    if (!partido || !partido.resultadoOficial) continue;

    const oficial = partido.resultadoOficial;
    const exacto = pr.golesLocal === oficial.golesLocal && pr.golesVisita === oficial.golesVisita;

    if (exacto) {
      puntos += 2;
      aciertosExactos += 1;
    } else {
      const signo = (a, b) => (a > b ? 1 : a < b ? -1 : 0);
      if (signo(pr.golesLocal, pr.golesVisita) === signo(oficial.golesLocal, oficial.golesVisita)) {
        puntos += 1;
        resultados += 1;
      }
    }
  }

  return { puntos, aciertosExactos, resultados };
}

const ORDEN_ESTADO = { RECHAZADO: 2, PENDIENTE: 1, APROBADO: 0 };

function peorEstadoPago(pronosticos) {
  let estado = 'APROBADO'; // empezamos en el mejor y bajamos a peor-de-N
  for (const p of pronosticos) {
    const est = p.estadoPago || 'PENDIENTE';
    if ((ORDEN_ESTADO[est] ?? 0) > (ORDEN_ESTADO[estado] ?? 0)) estado = est;
  }
  return pronosticos.length ? estado : 'PENDIENTE';
}

// ───────────────────────── lógica ─────────────────────────

async function unificarEnJornada(jornada, nombreObjetivo, dryRun) {
  const ids = jornada.partidos.map((p) => p._id);
  const idsStr = new Set(ids.map((id) => id.toString()));
  const partidosPorId = new Map(jornada.partidos.map((p) => [p._id.toString(), p]));

  const pronosticos = await Pronostico.find({ partidoId: { $in: ids } }).sort({ _id: 1 }).lean();

  // agrupar por clave + nombre normalizado
  const grupos = new Map();
  for (const p of pronosticos) {
    const key = identidadKey(p);
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        userId: p.userId ?? null,
        alias: p.alias ?? null,
        aliasKey: nombreNormalizado(p.aliasKey) || null,
        pronosticos: [],
      });
    }
    grupos.get(key).pronosticos.push(p);
  }

  // grupos que son la MISMA persona `nombreObjetivo` (nombre normalizado) en esta jornada
  const candidatos = [...grupos.values()].filter(
    (g) => nombreParticipante(g) === nombreObjetivo
  );

  console.log(`\n📍 Jornada "${jornada.nombre}" (${jornada._id.toString()})`);
  console.log(`   partidos=${jornada.partidos.length} pronosticos=${pronosticos.length}`);
  for (const c of candidatos) {
    const stats = puntosParticipante(c.pronosticos, partidosPorId);
    console.log(
      `   key=${c.key} userId=${c.userId ? c.userId.toString() : 'null'} alias=${JSON.stringify(c.alias)} aliasKey=${JSON.stringify(c.aliasKey)} ` +
      `picks=${c.pronosticos.length} puntos=${stats.puntos} estadoPago=${peorEstadoPago(c.pronosticos)}`
    );
  }

  if (candidatos.length < 2) {
    console.log(`   ✅ No hay duplicado de "${nombreObjetivo}" (grupos=${candidatos.length}).`);
    return { reasignados: 0, duplicadosEliminados: 0, omitidosPorUnico: 0, jornadaId: jornada._id.toString() };
  }

  // ── elegir PRINCIPAL: más puntos → más APROBADO → más picks → orden estable ──
  const rankeados = candidatos.map((c) => {
    const stats = puntosParticipante(c.pronosticos, partidosPorId);
    const aprobados = c.pronosticos.filter((p) => (p.estadoPago || 'PENDIENTE') === 'APROBADO').length;
    return { ...c, stats, aprobados };
  });

  rankeados.sort((a, b) =>
    b.stats.puntos - a.stats.puntos ||
    b.aprobados - a.aprobados ||
    b.pronosticos.length - a.pronosticos.length ||
    a.key.localeCompare(b.key)
  );

  const principal = rankeados[0];
  const duplicados = rankeados.slice(1);

  // snapshot ANTES (para verificar que no se pierde nada del principal)
  const principalIdsAntes = new Set(principal.pronosticos.map((p) => p._id.toString()));
  const principalPicksAntes = principal.pronosticos.length;
  const principalPuntosAntes = principal.stats.puntos;
  const principalPartidosAntes = new Set(principal.pronosticos.map((p) => p.partidoId.toString()));

  console.log(
    `   🏆 PRINCIPAL key=${principal.key} puntos=${principal.stats.puntos} picks=${principal.pronosticos.length}`
  );
  console.log(`   🧹 duplicados=${duplicados.length}`);

  // identidad canónica destino
  const canon = {
    userId: principal.userId ? new mongoose.Types.ObjectId(principal.userId.toString()) : null,
    aliasKey: principal.userId ? null : (principal.aliasKey || nombreObjetivo),
    alias: principal.alias ?? (nombreObjetivo ? nombreObjetivo : null),
  };

  // set de partidos ya cubiertos por el principal (para no violar índices únicos)
  const cubiertos = new Set([...principalPartidosAntes].filter((x) => idsStr.has(x)));

  let reasignados = 0;
  let omitidosPorUnico = 0;
  const aBorrar = []; // _id solo de duplicados

  for (const dup of duplicados) {
    // orden estable: los picks del duplicado por _id
    const picks = [...dup.pronosticos].sort((a, b) => a._id.toString().localeCompare(b._id.toString()));

    for (const p of picks) {
      const partidoIdStr = p.partidoId.toString();

      // partido debe seguir existiendo en la jornada
      if (!idsStr.has(partidoIdStr)) {
        aBorrar.push(p._id);
        continue;
      }

      if (cubiertos.has(partidoIdStr)) {
        // principal YA tiene pick en este partido → NO reasignar (no violar uniq_*); borrar solo duplicado
        omitidosPorUnico += 1;
        aBorrar.push(p._id);
        continue;
      }

      if (!dryRun) {
        await Pronostico.updateOne(
          { _id: p._id },
          { $set: { userId: canon.userId, aliasKey: canon.aliasKey, alias: canon.alias } }
        );
      }

      cubiertos.add(partidoIdStr);
      reasignados += 1;
      // ya no es "duplicado sobrante": se reasignó al principal; no añadir a aBorrar
      console.log(
        `   ↪ reasignado _id=${p._id.toString()} partido=${partidoIdStr} ` +
        `${partidoLabel(partidosPorId.get(partidoIdStr))} ${p.golesLocal}-${p.golesVisita}`
      );
    }
  }

  let duplicadosEliminados = 0;
  if (!dryRun && aBorrar.length) {
    const res = await Pronostico.deleteMany({ _id: { $in: aBorrar } });
    duplicadosEliminados = res.deletedCount ?? 0;
  } else {
    duplicadosEliminados = aBorrar.length;
  }

  // ── VERIFICACIÓN ──
  const ver = await verificar(jornada._id, ids, principal, principalIdsAntes, partidosPorId, dryRun, {
    principalPicksAntes,
    principalPuntosAntes,
  });

  console.log(
    `   ✅ resumen jornada: reasignados=${reasignados} duplicadosEliminados=${duplicadosEliminados} omitidosPorUnico=${omitidosPorUnico}`
  );

  return {
    reasignados,
    duplicadosEliminados,
    omitidosPorUnico,
    jornadaId: jornada._id.toString(),
    principalKey: principal.key,
    verificacion: ver,
  };
}

function partidoLabel(p) {
  if (!p) return '';
  return `${p.local} vs ${p.visitante}`;
}

async function verificar(jornadaId, ids, principal, principalIdsAntes, partidosPorId, dryRun, antes) {
  if (dryRun) return { dryRun: true };

  const pronosticos = await Pronostico.find({ partidoId: { $in: ids } }).sort({ _id: 1 }).lean();

  // reconstruir principal tras operación
  const canonUserId = principal.userId ? principal.userId.toString() : null;
  const canonAliasKey = principal.userId ? null : (nombreNormalizado(principal.aliasKey) || null);

  const picksPrincipal = pronosticos.filter((p) => {
    const uid = p.userId ? p.userId.toString() : null;
    if (canonUserId) return uid === canonUserId;
    return uid === null && (nombreNormalizado(p.aliasKey) || null) === canonAliasKey;
  });

  // ningún _id previo del principal se perdió
  const idsAhora = new Set(picksPrincipal.map((p) => p._id.toString()));
  const perdidos = [...principalIdsAntes].filter((id) => !idsAhora.has(id));

  const stats = puntosParticipante(picksPrincipal, partidosPorId);

  // no queda duplicado del mismo nombre
  const nombre = nombreParticipante(principal);
  const clavesMisma = new Set(
    pronosticos.filter((p) => nombreParticipante(p) === nombre).map((p) => identidadKey(p))
  );

  const ok = perdidos.length === 0 && stats.puntos >= antes.principalPuntosAntes;

  console.log(
    `   🔎 verificación: picksPrincipal=${picksPrincipal.length} (antes=${antes.principalPicksAntes}) ` +
    `puntos=${stats.puntos} (antes=${antes.principalPuntosAntes}) perdidos=${perdidos.length} clavesMisma=${clavesMisma.size} ok=${ok}`
  );

  return { ok, perdidos, picksPrincipal: picksPrincipal.length, puntos: stats.puntos, clavesMisma: [...clavesMisma] };
}

// ───────────────────────── main ─────────────────────────

async function main() {
  const jornadaId = process.argv[2] || process.env.JORNADA_ID || '';
  const nombreObjetivo = nombreNormalizado(process.argv[3] || process.env.NOMBRE || 'diex') || 'diex';
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mangobets-db';

  console.log(`🔌 Conectando a MongoDB… (${uri})`);
  await mongoose.connect(uri);

  const filtroJornada = {};
  if (jornadaId) {
    if (!mongoose.isValidObjectId(jornadaId)) throw new Error(`JORNADA_ID inválido: ${jornadaId}`);
    filtroJornada._id = new mongoose.Types.ObjectId(jornadaId);
  }

  const jornadas = await Jornada.find(filtroJornada).lean();

  let totReasignados = 0;
  let totEliminados = 0;
  let totOmitidos = 0;
  let tocadas = 0;

  for (const jornada of jornadas) {
    const r = await unificarEnJornada(jornada, nombreObjetivo, dryRun);
    if (r.reasignados || r.duplicadosEliminados || r.omitidosPorUnico) tocadas += 1;
    totReasignados += r.reasignados;
    totEliminados += r.duplicadosEliminados;
    totOmitidos += r.omitidosPorUnico;
  }

  console.log('\n════════════════════ RESUMEN ════════════════════');
  console.log(`jornadas revisadas=${jornadas.length} jornadas ajustadas=${tocadas}`);
  console.log(`pronósticos reasignados=${totReasignados}`);
  console.log(`duplicados eliminados=${totEliminados}`);
  console.log(`omitidos por índice único (principal ya tenía pick en ese partido)=${totOmitidos}`);
  console.log(`dryRun=${dryRun}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Error en unificarDiex:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
