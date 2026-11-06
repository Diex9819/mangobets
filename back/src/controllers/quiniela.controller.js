import mongoose from 'mongoose';
import { Jornada, Pronostico } from '../models/Quiniela.js';

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

  // ⚠️ Acierto al ganador o al empate (el marcador fue distinto, pero el resultado sí)
  const predioGano = golesLocal > golesVisita;
  const ofiGano = ofL > ofV;
  const predioEmpate = golesLocal === golesVisita;
  const ofiEmpate = ofL === ofV;

  const acerto = (predioGano && ofiGano) || (predioEmpate && ofiEmpate);

  return acerto ? 1 : 0;
}

// 🔑 Normaliza un alias para compararlo (minúsculas, sin espacios sobrantes)
function normalizarAlias(alias) {
  if (typeof alias !== 'string') return null;

  const limpio = alias.trim();

  if (!limpio || limpio.length > MAX_ALIAS) return null;

  return limpio.toLowerCase();
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

// 📅 GET /api/quinielas/activa
// Devuelve la jornada activa con los partidos y el pronóstico de quien consulta
// (su propio pronóstico si hay sesión, o el del alias indicado).
export const obtenerJornadaActiva = async (req, res) => {
  try {
    const jornada = await Jornada.findOne({ activa: true });

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

// 🎯 POST /api/quinielas/pronosticos
// Guarda el pronóstico para un partido. Si ya existe, lo ACTUALIZA.
// Público: si no hay sesión, se exige el alias para identificar al prognosticador.
export const guardarPronostico = async (req, res) => {
  try {
    const { partidoId, golesLocal, golesVisita, alias } = req.body;

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

    // 📅 Solo se pronostica sobre la jornada activa
    const jornada = await Jornada.findOne({ activa: true });

    if (!jornada) {
      return res.status(404).json({
        error: 'No hay ninguna jornada activa'
      });
    }

    // 🔒 Bloqueo por horario: si el primer partido ya se jugó, no se puede pronosticar
    const { cerrada } = await verificarCierreJornada(jornada);

    if (cerrada) {
      return res.status(423).json({
        error: 'Los pronósticos para esta jornada ya cerraron'
      });
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

    // 🪪 Identidad del prognosticador
    const { filtro, datos } = resolverIdentidad(req, alias);

    // 💾 Upsert: un pronóstico por persona y partido.
    // Los índices únicos parciales hacen la operación idempotente.
    const resultado = await Pronostico.updateOne(
      { ...filtro, partidoId: partido._id },
      { $set: { ...datos, golesLocal, golesVisita, enviado: true, estadoPago: 'PENDIENTE' } },
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

// 🔒 Verificación de cierre de la jornada.
// Si el primer partido de la jornada ya se jugó (hora de inicio pasada),
// ya no se aceptan nuevos pronósticos (bloqueo por horario).
async function verificarCierreJornada(jornada) {
  const partidos = jornada?.partidos || [];

  if (!partidos.length) {
    return { cerrada: false };
  }

  // ⏱️ Primer partido de la jornada (el más próximo en el tiempo)
  const primerPartido = [...partidos].sort(
    (a, b) => new Date(a.horario).getTime() - new Date(b.horario).getTime()
  )[0];

  if (!primerPartido) {
    return { cerrada: false };
  }

  const inicio = new Date(primerPartido.horario).getTime();
  const cerrada = !Number.isNaN(inicio) && Date.now() > inicio;

  return { cerrada, primerPartido };
}

// 🎯 POST /api/quinielas/pronosticos/batch
// Guarda VARIOS pronósticos (marcador exacto) en un solo request.
// El frontend lo usa para el botón "💾 Guardar Quiniela".
// Público: si no hay sesión, se exige el alias en el body.
export const guardarPronosticosBatch = async (req, res) => {
  try {
    const { pronosticos, alias } = req.body;

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

    // 📅 Solo se pronostica sobre la jornada activa
    const jornada = await Jornada.findOne({ activa: true });

    if (!jornada) {
      return res.status(404).json({
        error: 'No hay ninguna jornada activa'
      });
    }

    // 🔒 Bloqueo por horario: si el primer partido ya se jugó, no se puede pronosticar
    const { cerrada } = await verificarCierreJornada(jornada);

    if (cerrada) {
      return res.status(423).json({
        error: 'Los pronósticos para esta jornada ya cerraron'
      });
    }

    // 🪪 Identidad del prognosticador
    const { filtro, datos } = resolverIdentidad(req, alias);

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

      const resultado = await Pronostico.updateOne(
        { ...filtro, partidoId: p.partidoId },
        { $set: { ...datos, golesLocal: p.golesLocal, golesVisita: p.golesVisita, enviado: true, estadoPago: 'PENDIENTE' } },
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
    console.error('Error en guardarPronosticosBatch (quiniela):', err);
    res.status(500).json({ error: 'Error al guardar la quiniela' });
  }
};

// 🏆 GET /api/quinielas/jornadas/:jornadaId/posiciones
// Tabla de posiciones (leaderboard): solo pronósticos de participantes
// con estadoPago === 'APROBADO'. Puntos: marcador exacto = 2, acierto de
// resultado = 1, error = 0. Ordena por puntos descendente (empate → más
// aciertos exactos primero).
export const listarPosiciones = async (req, res) => {
  try {
    const { jornadaId } = req.params;

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const ids = jornada.partidos.map((p) => p._id);

    const pronosticos = await Pronostico.find({ partidoId: { $in: ids } }).lean();

    // 🔒 Privacidad: los pronósticos detallados de los participantes son
    //    privados hasta que la jornada inicie (hora del primer partido).
    //    El administrador puede verlos en cualquier momento.
    const esAdmin = Boolean(req.user && req.user.role === 'ADMIN');
    const primerPartido = jornada.partidos
      .slice()
      .sort((a, b) => new Date(a.horario).getTime() - new Date(b.horario).getTime())[0];
    const inicioMs = primerPartido ? new Date(primerPartido.horario).getTime() : null;
    const iniciada = inicioMs !== null && Date.now() >= inicioMs;
    const puedeVerPicks = esAdmin || iniciada;

    // 🗂️ Agrupar pronósticos por persona (identidad)
    const participantesMap = new Map();

    for (const p of pronosticos) {
      const key = `${p.userId ?? 'anon'}:${p.aliasKey ?? p.alias ?? ''}`;

      if (!participantesMap.has(key)) {
        participantesMap.set(key, {
          userId: p.userId ?? null,
          alias: p.alias ?? null,
          aliasKey: p.aliasKey ?? null,
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
          const predioGano = pr.golesLocal > pr.golesVisita;
          const ofiGano = oficial.golesLocal > oficial.golesVisita;
          const predioEmpate = pr.golesLocal === pr.golesVisita;
          const ofiEmpate = oficial.golesLocal === oficial.golesVisita;

          const acerto = (predioGano && ofiGano) || (predioEmpate && ofiEmpate);

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
      posicion: posiciones
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
    partidos: doc.partidos.map((p) => {
      const miPronostico = miPronosticoDe(p._id);

      return {
        id: p._id.toString(),
        local: p.local,
        visitante: p.visitante,
        horario: p.horario,
        resultadoOficial: p.resultadoOficial,
        miPronostico,
        puntos:
          miPronostico && miPronostico.estadoPago === 'APROBADO' && p.resultadoOficial
            ? calcularPuntos(miPronostico, p.resultadoOficial)
            : null
      };
    }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}
