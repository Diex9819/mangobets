import mongoose from 'mongoose';
import { Jornada, Pronostico } from '../models/Quiniela.js';
import { partidoAbiertoParaPronosticar } from '../utils/quinielaCierre.js';

// 🪪 Máximo de caracteres del alias
const MAX_ALIAS = 40;

// 🧮 Puntuación con marcadores exactos:
//  - Marcador exacto (golesLocal y golesVisita coinciden con el oficial): 2 pts
//  - Acierto al ganador o al empate (marcador distinto pero mismo resultado): 1 pt
//  - Fallo: 0 pts
//  - Sin resultado oficial publicado: null
function calcularPuntos(pronostico, resultadoOficial) {
  if (!pronostico || !resultadoOficial) return null;

  const { golesLocal, golesVisita } = pronostico;
  const { golesLocal: ofL, golesVisita: ofV } = resultadoOficial;

  // ✅ Marcador exacto: golesLocal y golesVisita coinciden con el oficial
  if (golesLocal === ofL && golesVisita === ofV) {
    return 2;
  }

  // ⚠️ Acierto al resultado (ganador local, empate o ganador visitante)
  const signo = (a, b) => (a > b ? 1 : a < b ? -1 : 0);
  const acerto = signo(golesLocal, golesVisita) === signo(ofL, ofV);

  return acerto ? 1 : 0;
}

// 🔑 Normaliza un alias para compararlo (minúsculas, sin espacios sobrantes)
function normalizarAlias(alias) {
  if (typeof alias !== 'string') return null;

  const limpio = alias.trim();

  if (!limpio || limpio.length > MAX_ALIAS) return null;

  return limpio.toLowerCase();
}

// 🔑 Nombre normalizado para comparar identidades (trim + minúsculas)
function nombreNormalizado(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim().toLowerCase() : null;
}

// 🔑 Nombre efectivo de un pronóstico/participante (aliasKey canónico; alias como respaldo)
function nombreParticipante(p) {
  return nombreNormalizado(p?.aliasKey) || nombreNormalizado(p?.alias) || null;
}

// 🔑 Llave determinista de agrupación (userId canónico string + aliasKey/alias minúsculas)
function identidadKey(p) {
  const userId = p?.userId ? p.userId.toString() : 'anon';
  const nombre = nombreParticipante(p) || '';
  return `${userId}:${nombre}`;
}

// 🪪 Identidad de quien pronostica.
// - Con sesión (token): el userId manda y el alias es su nombre (referencia).
// - Sin sesión: el alias es obligatorio y es la identidad del pronóstico.
function resolverIdentidad(req, aliasBody) {
  if (req.user) {
    return {
      filtro: { userId: req.user._id },
      datos: {
        userId: req.user._id,
        alias: (req.user.name || '').trim() || null,
        aliasKey: null
      }
    };
  }

  const aliasLimpio = typeof aliasBody === 'string' ? aliasBody.trim() : '';
  const aliasKey = normalizarAlias(aliasLimpio);

  return {
    filtro: { userId: null, aliasKey },
    datos: {
      userId: null,
      alias: aliasLimpio || null,
      aliasKey
    }
  };
}

// 🪪 Identidad UNIFICADA por jornada: evita crear una segunda fila con el mismo nombre.
//   - Autenticado (`req.user`): si existe anónimo con mismo nombre normalizado en esta jornada,
//     o anónimo que coincide con este usuario, se reutiliza la identidad existente.
//   - Anónimo: si existe participante (autenticado o anónimo) con mismo nombre normalizado
//     en esta jornada, se reutiliza esa identidad en vez de crear `anon:nombre`.
//   - `aliasKey` canónico siempre trim().toLowerCase(). `horario/resultado/estadoPago` no afectan.
async function resolverIdentidadUnificada(req, aliasBody, jornada) {
  const base = resolverIdentidad(req, aliasBody);

  const ids = (jornada?.partidos || []).map((p) => p._id);
  if (!ids.length) return base;

  // nombre normalizado de QUIEN envía
  const nombreBase =
    nombreNormalizado(base.datos.aliasKey) ||
    nombreNormalizado(base.datos.alias) ||
    nombreNormalizado(req.user?.name) ||
    null;

  if (!nombreBase) return base;

  // participantes ya existentes EN ESTA JORNADA
  const existentes = await Pronostico.find({ partidoId: { $in: ids } }).lean();
  const keyBase = identidadKey(base.datos);

  // candidatos = mismo nombre normalizado en esta jornada (cualquier namespace)
  const porClave = new Map();
  for (const p of existentes) {
    if (nombreParticipante(p) !== nombreBase) continue;

    const key = identidadKey(p);
    if (!porClave.has(key)) {
      porClave.set(key, {
        key,
        userId: p.userId ?? null,
        alias: p.alias ?? null,
        aliasKey: nombreNormalizado(p.aliasKey) || null,
        count: 0,
        aprobados: 0
      });
    }
    const c = porClave.get(key);
    c.count += 1;
    if ((p.estadoPago || 'PENDIENTE') === 'APROBADO') c.aprobados += 1;
  }

  // siempre incluir la clave exacta si ya tiene picks
  if (!porClave.has(keyBase)) {
    const propio = existentes.find((p) => identidadKey(p) === keyBase);
    if (propio) {
      porClave.set(keyBase, {
        key: keyBase,
        userId: propio.userId ?? null,
        alias: propio.alias ?? null,
        aliasKey: nombreNormalizado(propio.aliasKey) || null,
        count: 1,
        aprobados: (propio.estadoPago || 'PENDIENTE') === 'APROBADO' ? 1 : 0
      });
    }
  }

  const candidatos = [...porClave.values()];
  if (!candidatos.length) return base;

  // canónica: clave exacta primero; luego más picks, más aprobados, orden estable
  let canon = candidatos.find((c) => c.key === keyBase);
  if (!canon) {
    canon = candidatos
      .slice()
      .sort((a, b) =>
        b.count - a.count ||
        b.aprobados - a.aprobados ||
        a.key.localeCompare(b.key)
      )[0];
  }

  if (canon.userId != null) {
    // participante autenticado canónico
    return {
      filtro: { userId: canon.userId },
      datos: {
        userId: canon.userId,
        alias: canon.alias ?? base.datos.alias ?? null,
        aliasKey: null
      }
    };
  }

  // participante anónimo canónico (userId null + aliasKey normalizado)
  const aliasKey = canon.aliasKey || nombreBase;
  return {
    filtro: { userId: null, aliasKey },
    datos: {
      userId: null,
      alias: canon.alias ?? base.datos.alias ?? null,
      aliasKey
    }
  };
}

// 📅 GET /api/quinielas/activa
// Devuelve la jornada activa con los partidos y el pronóstico de quien consulta
// (su propio pronóstico si hay sesión, o el del alias indicado).
export const obtenerJornadaActiva = async (req, res) => {
  try {
    const { jornadaId } = req.query;

    let jornada;

    if (jornadaId) {
      if (!mongoose.isValidObjectId(jornadaId)) {
        return res.status(400).json({ error: 'ID de jornada inválido' });
      }
      jornada = await Jornada.findById(jornadaId);
      if (!jornada || !jornada.activa) {
        return res.status(404).json({
          error: 'Jornada no encontrada o no está activa',
          jornadaId: jornadaId
        });
      }
    } else {
      // 🔝 Default: la jornada activa más reciente (compatibilidad)
      jornada = await Jornada.findOne({ activa: true }).sort({ createdAt: -1 });
    }

    if (!jornada) {
      return res.status(404).json({
        error: 'No hay ninguna jornada activa'
      });
    }

    // 🗂️ Pronósticos de quien consulta para los partidos de ESTA jornada
    const partidoIds = jornada.partidos.map((p) => p._id);

    let pronosticos = [];

    if (req.user) {
      // 👤 Con sesión: sus propios pronósticos
      pronosticos = await Pronostico.find({
        userId: req.user._id,
        partidoId: { $in: partidoIds }
      }).lean();
    } else {
      // 🪪 Sin sesión: los del alias indicado (?alias=)
      const aliasKey = normalizarAlias(req.query.alias);

      if (aliasKey) {
        pronosticos = await Pronostico.find({
          userId: null,
          aliasKey,
          partidoId: { $in: partidoIds }
        }).lean();
      }
    }

    const porPartido = new Map(
      pronosticos.map((p) => [
        p.partidoId.toString(),
        {
          golesLocal: p.golesLocal,
          golesVisita: p.golesVisita,
          enviado: p.enviado === true,
          estadoPago: p.estadoPago || 'PENDIENTE'
        }
      ])
    );

    res.json(
      formatJornada(jornada, (partidoId) => porPartido.get(partidoId.toString()) || null)
    );
  } catch (err) {
    console.error('Error en obtenerJornadaActiva (quiniela):', err);
    res.status(500).json({ error: 'Error al obtener la jornada activa' });
  }
};

// 🏆 GET /api/quinebelas/jornadas/activas
// Lista de jornadas ACTIVAS (ordenadas por fecha de creación, más reciente
// primero) para el selector de quinielas. Público.
export const listarJornadasActivas = async (req, res) => {
  try {
    const jornadas = await Jornada.find({ activa: true }).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      jornadas: jornadas.map((j) => ({
        id: j._id.toString(),
        nombre: j.nombre,
        activa: j.activa,
        premio: j.premio ?? 0,
        partidos: j.partidos.length,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt
      }))
    });
  } catch (err) {
    console.error('Error en listarJornadasActivas (quiniela):', err);
    res.status(500).json({ error: 'Error al listar las jornadas activas' });
  }
};

// 🎯 POST /api/quinielas/pronosticos
// Guarda el pronóstico para un partido. Si ya existe, lo ACTUALIZA.
// Público: si no hay sesión, se exige el alias para identificar al prognosticador.
export const guardarPronostico = async (req, res) => {
  try {
    const { partidoId, golesLocal, golesVisita, alias, jornadaId } = req.body;

    // 🧪 Validación de entrada
    const errors = [];

    if (!partidoId) {
      errors.push({ field: 'partidoId', message: 'partidoId es requerido' });
    } else if (!mongoose.isValidObjectId(partidoId)) {
      errors.push({ field: 'partidoId', message: 'partidoId debe ser un ObjectId válido' });
    }

    if (typeof golesLocal !== 'number' || !Number.isInteger(golesLocal) || golesLocal < 0) {
      errors.push({ field: 'golesLocal', message: 'golesLocal debe ser un entero >= 0' });
    }

    if (typeof golesVisita !== 'number' || !Number.isInteger(golesVisita) || golesVisita < 0) {
      errors.push({ field: 'golesVisita', message: 'golesVisita debe ser un entero >= 0' });
    }

    // 🪪 Sin sesión, el alias es OBLIGATORIO: sin él no se sabe de quién
    // es el pronóstico y no se podría guardar de forma única.
    if (!req.user) {
      const aliasLimpio = typeof alias === 'string' ? alias.trim() : '';

      if (!aliasLimpio) {
        errors.push({
          field: 'alias',
          message: 'alias es requerido para pronosticar sin iniciar sesión'
        });
      } else if (aliasLimpio.length > MAX_ALIAS) {
        errors.push({
          field: 'alias',
          message: `alias debe tener ${MAX_ALIAS} caracteres o menos`
        });
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // 📅 Jornada activa a usar: jornadaId pasada (validada) o la más reciente activa
    let jornada;

    if (jornadaId) {
      if (!mongoose.isValidObjectId(jornadaId)) {
        return res.status(400).json({ error: 'ID de jornada inválido' });
      }
      jornada = await Jornada.findById(jornadaId);
      if (!jornada || !jornada.activa) {
        return res.status(404).json({
          error: 'Jornada no encontrada o no está activa',
          jornadaId: jornadaId
        });
      }
    } else {
      jornada = await Jornada.findOne({ activa: true }).sort({ createdAt: -1 });
      if (!jornada) {
        return res.status(404).json({ error: 'No hay ninguna jornada activa' });
      }
    }

    // ⚽ El partido debe pertenecer a la jornada activa
    const partido = jornada.partidos.id(partidoId);

    if (!partido) {
      return res.status(404).json({
        error: 'El partido no pertenece a la jornada activa',
        partidoId
      });
    }

    // 🏁 No se pronostica sobre partidos ya resueltos
    if (partido.resultadoOficial) {
      return res.status(400).json({
        error: 'El partido ya tiene resultado oficial, no se puede pronosticar',
        partidoId
      });
    }

    // 🔒 Bloqueo POR PARTIDO: horario/fechaInicio pasado, partido cerrado o recepción cerrada
    if (!partidoAbiertoParaPronosticar(partido, jornada)) {
      return res.status(423).json({
        error: 'Los pronósticos para este partido ya cerraron',
        partidoId
      });
    }

    // 🪪 Identidad del prognosticador (UNIFICADA por jornada: no crear segunda fila con mismo nombre)
    const { filtro, datos } = await resolverIdentidadUnificada(req, alias, jornada);

    // 💾 Upsert: un pronóstico por persona y partido.
    // Los índices únicos parciales hacen la operación idempotente.
    const resultado = await Pronostico.updateOne(
      { ...filtro, partidoId: partido._id },
      {
        $set: { ...datos, golesLocal, golesVisita, enviado: true },
        $setOnInsert: { estadoPago: 'PENDIENTE' }
      },
      {
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    const creado = resultado.upsertedCount > 0;

    const pronostico = await Pronostico.findOne({
      ...filtro,
      partidoId: partido._id
    }).lean();

    res.status(creado ? 201 : 200).json({
      success: true,
      creado,
      pronostico: {
        id: pronostico._id.toString(),
        partidoId: pronostico.partidoId.toString(),
        golesLocal: pronostico.golesLocal,
        golesVisita: pronostico.golesVisita,
        alias: pronostico.alias,
        actualizadoEn: pronostico.updatedAt
      }
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'Ya existe un pronóstico para esa persona y ese partido'
      });
    }
    console.error('Error en guardarPronostico (quiniela):', err);
    res.status(500).json({ error: 'Error al guardar el pronóstico' });
  }
};

// 🎯 POST /api/quinielas/pronosticos/batch
// Guarda VARIOS pronósticos (marcador exacto) en un solo request.
// El frontend lo usa para el botón "💾 Guardar Quiniela".
// Público: si no hay sesión, se exige el alias en el body.
export const guardarPronosticosBatch = async (req, res) => {
  try {
    const { pronosticos, alias } = req.body;
    const jornadaId = req.body?.jornadaId ?? req.query?.jornadaId;

    if (!Array.isArray(pronosticos) || pronosticos.length === 0) {
      return res.status(422).json({
        error: 'Validation failed',
        details: [
          { field: 'pronosticos', message: 'pronosticos debe ser un array con al menos un pronóstico' }
        ]
      });
    }

    // 🧪 Validación de entrada
    const errors = [];

    // 🪪 Sin sesión, el alias es OBLIGATORIO para que el pronóstico tenga
    //    identidad válida (mismo criterio que guardarPronostico individual).
    if (!req.user) {
      const aliasLimpio = typeof alias === 'string' ? alias.trim() : '';

      if (!aliasLimpio) {
        errors.push({
          field: 'alias',
          message: 'alias es requerido para pronosticar sin iniciar sesión'
        });
      } else if (aliasLimpio.length > MAX_ALIAS) {
        errors.push({
          field: 'alias',
          message: `alias debe tener ${MAX_ALIAS} caracteres o menos`
        });
      }
    }

    for (const p of pronosticos) {
      if (!p?.partidoId) {
        errors.push({ field: 'partidoId', message: 'partidoId es requerido' });
      } else if (!mongoose.isValidObjectId(p.partidoId)) {
        errors.push({ field: 'partidoId', message: 'partidoId debe ser un ObjectId válido' });
      }

      if (typeof p?.golesLocal !== 'number' || !Number.isInteger(p.golesLocal) || p.golesLocal < 0) {
        errors.push({ field: 'golesLocal', message: 'golesLocal debe ser un entero >= 0' });
      }

      if (typeof p?.golesVisita !== 'number' || !Number.isInteger(p.golesVisita) || p.golesVisita < 0) {
        errors.push({ field: 'golesVisita', message: 'golesVisita debe ser un entero >= 0' });
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // 📅 Jornada activa a usar: jornadaId pasada (validada) o la más reciente activa
    let jornada;

    if (jornadaId) {
      if (!mongoose.isValidObjectId(jornadaId)) {
        return res.status(400).json({ error: 'ID de jornada inválido' });
      }
      jornada = await Jornada.findById(jornadaId);
      if (!jornada || !jornada.activa) {
        return res.status(404).json({
          error: 'Jornada no encontrada o no está activa',
          jornadaId: jornadaId
        });
      }
    } else {
      jornada = await Jornada.findOne({ activa: true }).sort({ createdAt: -1 });
      if (!jornada) {
        return res.status(404).json({
          error: 'No hay ninguna jornada activa'
        });
      }
    }

    // 🧹 Prevalidación de TODO el lote ANTES de guardar (evita escrituras parciales):
    //    cada partido debe pertenecer a la jornada activa, estar sin resultado oficial
    //    y estar ABIERTO por partido (horario/fechaInicio, cerrado, recepción).
    for (const p of pronosticos) {
      const partido = jornada.partidos.id(p.partidoId);

      if (!partido) {
        return res.status(404).json({
          error: 'El partido no pertenece a la jornada activa',
          jornadaId: jornada.id.toString(),
          partidoId: p.partidoId
        });
      }

      if (partido.resultadoOficial) {
        return res.status(400).json({
          error: 'El partido ya tiene resultado oficial, no se puede pronosticar',
          partidoId: p.partidoId
        });
      }

      if (!partidoAbiertoParaPronosticar(partido, jornada)) {
        return res.status(423).json({
          error: 'Los pronósticos para este partido ya cerraron',
          partidoId: p.partidoId
        });
      }
    }

    // 🪪 Identidad del prognosticador (UNIFICADA por jornada; misma para todo el lote)
    const { filtro, datos } = await resolverIdentidadUnificada(req, alias, jornada);

    const guardados = [];
    let creados = 0;

    // 💾 Upsert por cada pronóstico del lote
    for (const p of pronosticos) {
      const partido = jornada.partidos.id(p.partidoId);

      // ⚽ El partido debe pertenecer a la jornada activa
      if (!partido) {
        return res.status(404).json({
          error: 'El partido no pertenece a la jornada activa',
          partidoId: p.partidoId
        });
      }

      // 🏁 No se pronostica sobre partidos ya resueltos
      if (partido.resultadoOficial) {
        return res.status(400).json({
          error: 'El partido ya tiene resultado oficial, no se puede pronosticar',
          partidoId: p.partidoId
        });
      }

      // 🔒 Defensa extra: re-chequeo por partido antes de escribir
      if (!partidoAbiertoParaPronosticar(partido, jornada)) {
        return res.status(423).json({
          error: 'Los pronósticos para este partido ya cerraron',
          partidoId: p.partidoId
        });
      }

      const resultado = await Pronostico.updateOne(
        { ...filtro, partidoId: p.partidoId },
        {
          $set: { ...datos, golesLocal: p.golesLocal, golesVisita: p.golesVisita, enviado: true },
          $setOnInsert: { estadoPago: 'PENDIENTE' }
        },
        {
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true
        }
      );

      if (resultado.upsertedCount > 0) {
        creados += 1;
      }

      const pronostico = await Pronostico.findOne({
        ...filtro,
        partidoId: p.partidoId
      }).lean();

      guardados.push({
        partidoId: pronostico.partidoId.toString(),
        golesLocal: pronostico.golesLocal,
        golesVisita: pronostico.golesVisita,
        alias: pronostico.alias,
        actualizadoEn: pronostico.updatedAt
      });
    }

    res.json({
      success: true,
      guardados: guardados.length,
      creados,
      pronosticos: guardados
    });
  } catch (err) {
    // 🧪 Validación de Mongoose (ej. runValidators en el upsert): detalles por campo
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    console.error('Error en guardarPronosticosBatch (quiniela):', err);
    res.status(500).json({ error: 'Error al guardar la quiniela' });
  }
};

// 🏆 GET /api/quinielas/jornadas/:jornadaId/posiciones
// Tabla de posiciones (leaderboard): solo pronósticos de participantes
// con estadoPago === 'APROBADO'. Puntos: marcador exacto = 2, acierto de
// resultado = 1, error = 0. Ordena por puntos descendente (empate → más
// aciertos exactos primero).
// 📊 Prioridad de estado para agregar participantes (peor-de-N), igual que listarParticipantes:
//    RECHAZADO > PENDIENTE > APROBADO.
const ORDEN_ESTADO = { RECHAZADO: 2, PENDIENTE: 1, APROBADO: 0 };

export const listarPosiciones = async (req, res) => {
  try {
    const { jornadaId } = req.params;

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const ids = jornada.partidos.map((p) => p._id);

    // 📥 Orden determinista (estadoPago first-seen estable + listado estable)
    const pronosticos = await Pronostico.find({ partidoId: { $in: ids } })
      .sort({ _id: 1 })
      .lean();

    // 🔒 Privacidad: los pronósticos detallados de los participantes son
    //    privados hasta que la jornada inicie (hora del primer partido).
    //    El administrador puede verlos en cualquier momento.
    const esAdmin = Boolean(req.user && req.user.role === 'ADMIN');

    // ⏱️ Primer partido por `horario` (canónico) o alias `fechaInicio`; orden determinista.
    const tiempoPartido = (p) => {
      const ms = new Date(p?.horario ?? p?.fechaInicio).getTime();
      return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms; // fechas inválidas al final
    };
    const primerPartido = jornada.partidos.slice().sort((a, b) => tiempoPartido(a) - tiempoPartido(b))[0];

    const inicioMs = primerPartido ? new Date(primerPartido.horario ?? primerPartido.fechaInicio).getTime() : null;
    const inicioValido = inicioMs !== null && !Number.isNaN(inicioMs);
    const iniciada = inicioValido && Date.now() >= inicioMs;
    const puedeVerPicks = esAdmin || iniciada;

    // 🗂️ Agrupar pronósticos por persona (identidad)
    const participantesMap = new Map();

    for (const p of pronosticos) {
      // 🔑 llave de agrupación normalizada (aliasKey/alias minúsculas; userId canónico string)
      const key = identidadKey(p);

      if (!participantesMap.has(key)) {
        participantesMap.set(key, {
          userId: p.userId ?? null,
          alias: p.alias ?? null,
          // 🔑 aliasKey real (minúsculas); null si autenticado/no existe. NO usar `alias` como sustituto.
          aliasKey: nombreNormalizado(p.aliasKey) || null,
          estadoPago: p.estadoPago || 'PENDIENTE',
          pronosticos: []
        });
      }

      const participante = participantesMap.get(key);

      // ⚽ Equipos del partido (para armar el pronóstico con contexto de equipos)
      const partidoDe = jornada.partidos.find(
        (partido) => partido._id.toString() === p.partidoId.toString()
      );

      participante.pronosticos.push({
        partidoId: p.partidoId.toString(),
        golesLocal: p.golesLocal,
        golesVisita: p.golesVisita,
        local: partidoDe?.local || null,
        visitante: partidoDe?.visitante || null,
        enviado: p.enviado === true,
        estadoPago: p.estadoPago || 'PENDIENTE'
      });

      // 📊 Estado del participante = el "peor" entre sus picks (ORDEN_ESTADO), igual que listarParticipantes
      const est = p.estadoPago || 'PENDIENTE';
      if ((ORDEN_ESTADO[est] ?? 0) > (ORDEN_ESTADO[participante.estadoPago] ?? 0)) {
        participante.estadoPago = est;
      }
    }

    const posiciones = [];

    for (const participante of participantesMap.values()) {
      // 🔒 Solo participantes con pago aprobado cuentan en la tabla
      if (participante.estadoPago !== 'APROBADO') {
        continue;
      }

      let puntos = 0;
      let aciertosExactos = 0;
      let resultados = 0;

      for (const pr of participante.pronosticos) {
        const partido = jornada.partidos.id(pr.partidoId);

        if (!partido || !partido.resultadoOficial) {
          continue;
        }

        const oficial = partido.resultadoOficial;
        const exacto =
          pr.golesLocal === oficial.golesLocal && pr.golesVisita === oficial.golesVisita;

        if (exacto) {
          puntos += 2;
          aciertosExactos += 1;
        } else {
          const signo = (a, b) => (a > b ? 1 : a < b ? -1 : 0);
          const acerto = signo(pr.golesLocal, pr.golesVisita) === signo(oficial.golesLocal, oficial.golesVisita);

          if (acerto) {
            puntos += 1;
            resultados += 1;
          }
        }
      }

      posiciones.push({
        userId: participante.userId,
        alias: participante.alias,
        aliasKey: participante.aliasKey,
        estadoPago: participante.estadoPago,
        // 🔒 Antes de iniciar la jornada los picks son privados (salvo admin)
        pronosticos: puedeVerPicks ? participante.pronosticos : [],
        puntos,
        aciertosExactos,
        resultados
      });
    }

    // 🏆 Ordenar: mayor puntos primero, en empate mayor aciertos exactos
    posiciones.sort((a, b) => b.puntos - a.puntos || b.aciertosExactos - a.aciertosExactos);

    res.json({
      success: true,
      jornadaId,
      // 🔒 ¿Esta respuesta incluye los `pronosticos` detallados? (admin || jornada iniciada)
      puedeVerPicks,
      position: posiciones
    });
  } catch (err) {
    console.error('Error en listarPosiciones (quiniela):', err);
    res.status(500).json({ error: 'Error al calcular las posiciones' });
  }
};

// 🔥 FORMAT
function formatJornada(doc, miPronosticoDe) {
  return {
    id: doc._id.toString(),
    nombre: doc.nombre,
    activa: doc.activa,
    premio: doc.premio ?? 0,
    recepcionAbierta: doc.recepcionAbierta !== false,
    partidos: doc.partidos.map((p) => {
      const miPronostico = miPronosticoDe(p._id);

      return {
        id: p._id.toString(),
        local: p.local,
        visitante: p.visitante,
        horario: p.horario,
        fechaInicio: p.horario, // 🏷️ alias de horario (campo canónico: horario)
        cerrado: p.cerrado === true,
        puedePronosticar: partidoAbiertoParaPronosticar(p, doc),
        resultadoOficial: p.resultadoOficial,
        miPronostico,
        puntos:
          miPronostico && p.resultadoOficial
            ? calcularPuntos(miPronostico, p.resultadoOficial)
            : null
      };
    }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}
