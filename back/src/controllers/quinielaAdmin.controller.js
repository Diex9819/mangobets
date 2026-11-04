import mongoose from 'mongoose';
import { Jornada, Pronostico } from '../models/Quiniela.js';

// 📅 ¿El valor es una fecha válida?
function esFechaValida(valor) {
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return !Number.isNaN(fecha.getTime());
}

// 👑 LISTAR JORNADAS
export const listarJornadas = async (req, res) => {
  try {
    const jornadas = await Jornada.find().sort({ activa: -1, createdAt: -1 });

    res.json(jornadas.map((j) => formatJornadaAdmin(j)));
  } catch (err) {
    console.error('Error en listarJornadas (quiniela admin):', err);
    res.status(500).json({ error: 'Error al listar las jornadas' });
  }
};

// 👑 CREAR JORNADA (con sus partidos)
export const crearJornada = async (req, res) => {
  try {
    const { nombre, activa, partidos } = req.body;

    // 🧪 Validación de entrada
    const errors = [];

    if (!nombre || !String(nombre).trim()) {
      errors.push({ field: 'nombre', message: 'nombre es requerido' });
    }

    if (!Array.isArray(partidos)) {
      errors.push({ field: 'partidos', message: 'partidos debe ser un array' });
    } else {
      partidos.forEach((p, i) => {
        if (!p?.local || !String(p.local).trim()) {
          errors.push({ field: `partidos.${i}.local`, message: 'local es requerido' });
        }
        if (!p?.visitante || !String(p.visitante).trim()) {
          errors.push({ field: `partidos.${i}.visitante`, message: 'visitante es requerido' });
        }
        if (!p?.horario) {
          errors.push({ field: `partidos.${i}.horario`, message: 'horario es requerido' });
        } else if (!esFechaValida(p.horario)) {
          errors.push({ field: `partidos.${i}.horario`, message: 'horario no es una fecha válida' });
        }
        if (p?.resultadoOficial) {
          if (
            !Number.isInteger(p.resultadoOficial.golesLocal) ||
            !Number.isInteger(p.resultadoOficial.golesVisita) ||
            p.resultadoOficial.golesLocal < 0 ||
            p.resultadoOficial.golesVisita < 0
          ) {
            errors.push({
              field: `partidos.${i}.resultadoOficial`,
              message: 'resultadoOficial debe ser un marcador válido (golesLocal y golesVisita enteros >= 0)'
            });
          }
        }
      });
    }

    if (errors.length > 0) {
      return res.status(422).json({ error: 'Validation failed', details: errors });
    }

    const activar = activa === true;

    // 🔒 Si la nueva queda activa, se desactiva la actual primero
    // (el índice único parcial impide dos jornadas activas).
    if (activar) {
      await Jornada.updateMany({ activa: true }, { $set: { activa: false } });
    }

    const jornada = await Jornada.create({
      nombre: String(nombre).trim(),
      activa: activar,
      partidos: partidos.map((p) => ({
        local: String(p.local).trim(),
        visitante: String(p.visitante).trim(),
        horario: new Date(p.horario),
        resultadoOficial: p?.resultadoOficial
          ? {
              golesLocal: Number(p.resultadoOficial.golesLocal),
              golesVisita: Number(p.resultadoOficial.golesVisita)
            }
          : undefined
      }))
    });

    res.status(201).json(formatJornadaAdmin(jornada));
  } catch (err) {
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Ya hay una jornada activa' });
    }
    console.error('Error en crearJornada (quiniela admin):', err);
    res.status(500).json({ error: 'Error al crear la jornada' });
  }
};

// 👑 AGREGAR PARTIDO A UNA JORNADA EXISTENTE
export const agregarPartido = async (req, res) => {
  try {
    const { jornadaId } = req.params;
    const { local, visitante, horario } = req.body;

    if (!mongoose.isValidObjectId(jornadaId)) {
      return res.status(400).json({ error: 'ID de jornada inválido' });
    }

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada', id: jornadaId });
    }

    // 🧪 Validación de entrada
    const errors = [];

    if (!local || !String(local).trim()) {
      errors.push({ field: 'local', message: 'local es requerido' });
    }

    if (!visitante || !String(visitante).trim()) {
      errors.push({ field: 'visitante', message: 'visitante es requerido' });
    }

    if (!horario) {
      errors.push({ field: 'horario', message: 'horario es requerido' });
    } else if (!esFechaValida(horario)) {
      errors.push({ field: 'horario', message: 'horario no es una fecha válida' });
    }

    if (errors.length > 0) {
      return res.status(422).json({ error: 'Validation failed', details: errors });
    }

    // ⚽ Se agrega el nuevo partido al arreglo de la jornada (sin resultado aún)
    jornada.partidos.push({
      local: String(local).trim(),
      visitante: String(visitante).trim(),
      horario: new Date(horario)
    });

    await jornada.save();

    res.json(formatJornadaAdmin(jornada));
  } catch (err) {
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    console.error('Error en agregarPartido (quiniela admin):', err);
    res.status(500).json({ error: 'Error al agregar el partido' });
  }
};

// 👑 ACTIVAR JORNADA
export const activarJornada = async (req, res) => {
  try {
    const { jornadaId } = req.params;

    if (!mongoose.isValidObjectId(jornadaId)) {
      return res.status(400).json({ error: 'ID de jornada inválido' });
    }

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada', id: jornadaId });
    }

    // 🔒 Se desactiva la vigente antes de activar esta
    await Jornada.updateMany(
      { _id: { $ne: jornadaId }, activa: true },
      { $set: { activa: false } }
    );

    jornada.activa = true;
    await jornada.save();

    res.json(formatJornadaAdmin(jornada));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Ya hay una jornada activa' });
    }
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    console.error('Error en activarJornada (quiniela admin):', err);
    res.status(500).json({ error: 'Error al activar la jornada' });
  }
};

// 👑 PUBLICAR RESULTADO OFICIAL de un partido
export const publicarResultado = async (req, res) => {
  try {
    const { jornadaId, partidoId } = req.params;
    const { resultadoOficial } = req.body;

    if (!mongoose.isValidObjectId(jornadaId) || !mongoose.isValidObjectId(partidoId)) {
      return res.status(400).json({ error: 'ID de jornada o de partido inválido' });
    }

    const esMarcadorValido =
      resultadoOficial &&
      Number.isInteger(resultadoOficial.golesLocal) &&
      Number.isInteger(resultadoOficial.golesVisita) &&
      resultadoOficial.golesLocal >= 0 &&
      resultadoOficial.golesVisita >= 0;

    if (!esMarcadorValido) {
      return res.status(422).json({
        error: 'Validation failed',
        details: [
          {
            field: 'resultadoOficial',
            message:
              'resultadoOficial debe ser un marcador válido (golesLocal y golesVisita enteros >= 0)'
          }
        ]
      });
    }

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada', id: jornadaId });
    }

    // ⚽ El partido debe pertenecer a esa jornada
    const partido = jornada.partidos.id(partidoId);

    if (!partido) {
      return res.status(404).json({
        error: 'El partido no pertenece a la jornada',
        partidoId
      });
    }

    // 🏁 Se publica el marcador oficial exacto (goles local vs visita)
    partido.resultadoOficial = {
      golesLocal: resultadoOficial.golesLocal,
      golesVisita: resultadoOficial.golesVisita
    };
    await jornada.save();

    res.json(formatJornadaAdmin(jornada));
  } catch (err) {
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    console.error('Error en publicarResultado (quiniela admin):', err);
    res.status(500).json({ error: 'Error al publicar el resultado' });
  }
};

// 👑 EDITAR JORNADA (corregir el nombre capturado)
export const editarJornada = async (req, res) => {
  try {
    const { jornadaId } = req.params;
    const { nombre } = req.body;

    if (!mongoose.isValidObjectId(jornadaId)) {
      return res.status(400).json({ error: 'ID de jornada inválido' });
    }

    if (!nombre || !String(nombre).trim()) {
      return res.status(422).json({
        error: 'Validation failed',
        details: [{ field: 'nombre', message: 'nombre es requerido' }]
      });
    }

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada', id: jornadaId });
    }

    jornada.nombre = String(nombre).trim();
    await jornada.save();

    res.json(formatJornadaAdmin(jornada));
  } catch (err) {
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    console.error('Error en editarJornada (quiniela admin):', err);
    res.status(500).json({ error: 'Error al editar la jornada' });
  }
};

// 👑 ELIMINAR JORNADA
// También borra los pronósticos de sus partidos para no dejar huérfanos.
export const eliminarJornada = async (req, res) => {
  try {
    const { jornadaId } = req.params;

    if (!mongoose.isValidObjectId(jornadaId)) {
      return res.status(400).json({ error: 'ID de jornada inválido' });
    }

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada', id: jornadaId });
    }

    // 🧹 Pronósticos de los partidos de esta jornada
    const partidoIds = jornada.partidos.map((p) => p._id);
    const pronosticos = await Pronostico.deleteMany({ partidoId: { $in: partidoIds } });

    await Jornada.deleteOne({ _id: jornadaId });

    res.json({
      success: true,
      message: 'Jornada eliminada',
      pronosticosEliminados: pronosticos.deletedCount
    });
  } catch (err) {
    console.error('Error en eliminarJornada (quiniela admin):', err);
    res.status(500).json({ error: 'Error al eliminar la jornada' });
  }
};

// 👑 EDITAR PARTIDO (corregir local / visitante / horario)
export const editarPartido = async (req, res) => {
  try {
    const { jornadaId, partidoId } = req.params;
    const { local, visitante, horario } = req.body;

    if (!mongoose.isValidObjectId(jornadaId) || !mongoose.isValidObjectId(partidoId)) {
      return res.status(400).json({ error: 'ID de jornada o de partido inválido' });
    }

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada', id: jornadaId });
    }

    const partido = jornada.partidos.id(partidoId);

    if (!partido) {
      return res.status(404).json({
        error: 'El partido no pertenece a la jornada',
        partidoId
      });
    }

    // 🧪 Solo se modifican los campos que vienen en el body
    const errors = [];

    if (local !== undefined) {
      if (!String(local).trim()) {
        errors.push({ field: 'local', message: 'local no puede quedar vacío' });
      } else {
        partido.local = String(local).trim();
      }
    }

    if (visitante !== undefined) {
      if (!String(visitante).trim()) {
        errors.push({ field: 'visitante', message: 'visitante no puede quedar vacío' });
      } else {
        partido.visitante = String(visitante).trim();
      }
    }

    if (horario !== undefined) {
      if (!horario) {
        errors.push({ field: 'horario', message: 'horario no puede quedar vacío' });
      } else if (!esFechaValida(horario)) {
        errors.push({ field: 'horario', message: 'horario no es una fecha válida' });
      } else {
        partido.horario = new Date(horario);
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({ error: 'Validation failed', details: errors });
    }

    await jornada.save();

    res.json(formatJornadaAdmin(jornada));
  } catch (err) {
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    console.error('Error en editarPartido (quiniela admin):', err);
    res.status(500).json({ error: 'Error al editar el partido' });
  }
};

// 👑 ELIMINAR PARTIDO
// También borra los pronósticos de ese partido.
export const eliminarPartido = async (req, res) => {
  try {
    const { jornadaId, partidoId } = req.params;

    if (!mongoose.isValidObjectId(jornadaId) || !mongoose.isValidObjectId(partidoId)) {
      return res.status(400).json({ error: 'ID de jornada o de partido inválido' });
    }

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada', id: jornadaId });
    }

    const partido = jornada.partidos.id(partidoId);

    if (!partido) {
      return res.status(404).json({
        error: 'El partido no pertenece a la jornada',
        partidoId
      });
    }

    // 🧹 Pronósticos de ese partido
    const pronosticos = await Pronostico.deleteMany({ partidoId: partido._id });

    jornada.partidos.pull(partido._id);
    await jornada.save();

    res.json({
      success: true,
      message: 'Partido eliminado',
      pronosticosEliminados: pronosticos.deletedCount
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message
      }));
      return res.status(422).json({ error: 'Validation failed', details });
    }
    console.error('Error en eliminarPartido (quiniela admin):', err);
    res.status(500).json({ error: 'Error al eliminar el partido' });
  }
};

// 👑 LISTAR PARTICIPANTES DE UNA JORNADA (con estado de pago)
export const listarParticipantes = async (req, res) => {
  try {
    const { jornadaId } = req.params;

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const ids = jornada.partidos.map((p) => p._id);

    const pronosticos = await Pronostico.find({ partidoId: { $in: ids } }).lean();

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
      participante.estadoPago = p.estadoPago || 'PENDIENTE';
    }

    const participantes = Array.from(participantesMap.values());

    res.json({
      success: true,
      jornadaId,
      participantes
    });
  } catch (err) {
    console.error('Error en listarParticipantes (quiniela admin):', err);
    res.status(500).json({ error: 'Error al listar los participantes' });
  }
};

// 👑 APROBAR / RECHAZAR PARTICIPANTE (estado de pago)
export const aprobarParticipante = async (req, res) => {
  try {
    const { jornadaId } = req.params;
    const { userId, aliasKey, estado } = req.body;

    const estadosValidos = ['APROBADO', 'RECHAZADO'];

    if (!estadosValidos.includes(estado)) {
      return res.status(422).json({
        error: 'Validation failed',
        details: [{ field: 'estado', message: "estado debe ser 'APROBADO' o 'RECHAZADO'" }]
      });
    }

    const jornada = await Jornada.findById(jornadaId);

    if (!jornada) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const ids = jornada.partidos.map((p) => p._id);

    const filtro = { partidoId: { $in: ids } };

    if (userId) {
      filtro.userId = userId;
    }

    if (aliasKey) {
      filtro.aliasKey = aliasKey;
    }

    const result = await Pronostico.updateMany(filtro, { $set: { estadoPago: estado } });

    res.json({
      success: true,
      message: `Participante ${estado}`,
      actualizados: result.modifiedCount
    });
  } catch (err) {
    console.error('Error en aprobarParticipante (quiniela admin):', err);
    res.status(500).json({ error: 'Error al actualizar el estado del participante' });
  }
};

// 🔥 FORMAT (misma forma que la vista pública, para reutilizar el modelo)
function formatJornadaAdmin(doc) {
  return {
    id: doc._id.toString(),
    nombre: doc.nombre,
    activa: doc.activa,
    partidos: doc.partidos.map((p) => ({
      id: p._id.toString(),
      local: p.local,
      visitante: p.visitante,
      horario: p.horario,
      resultadoOficial: p.resultadoOficial,
      miPronostico: null
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}
