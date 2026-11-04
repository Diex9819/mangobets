import express from 'express';
import { verifyToken, verifyTokenOptional, isAdmin } from '../middlewares/authMiddleware.js';
import { pronosticoRateLimit } from '../middlewares/securityMiddleware.js';
import {
  obtenerJornadaActiva,
  guardarPronostico,
  guardarPronosticosBatch,
  listarPosiciones
} from '../controllers/quiniela.controller.js';
import {
  listarJornadas,
  crearJornada,
  agregarPartido,
  editarJornada,
  activarJornada,
  eliminarJornada,
  editarPartido,
  eliminarPartido,
  publicarResultado,
  listarParticipantes,
  aprobarParticipante
} from '../controllers/quinielaAdmin.controller.js';

const router = express.Router();

// 📅 JORNADA ACTIVA (incluye el pronóstico de quien consulta)
// verifyTokenOptional: si hay sesión se usa el userId; si no, el alias (?alias=).
router.get('/activa', verifyTokenOptional, obtenerJornadaActiva);

// 🎯 GUARDAR / ACTUALIZAR PRONÓSTICO
// Público: sin sesión se exige el alias en el body.
router.post('/pronosticos', verifyTokenOptional, pronosticoRateLimit, guardarPronostico);

// 🎯 GUARDAR LOTE DE PRONÓSTICOS
// Público: sin sesión se exige el alias en el body.
router.post('/pronosticos/batch', verifyTokenOptional, pronosticoRateLimit, guardarPronosticosBatch);

// 🏆 POSICIONES / LEADERBOARD
router.get('/jornadas/:jornadaId/posiciones', listarPosiciones);

// =====================
// 👑 ADMIN
// =====================

// 📋 Listar jornadas
router.get('/admin/jornadas', verifyToken, isAdmin, listarJornadas);

// 🆕 Crear jornada con sus partidos
router.post('/admin/jornadas', verifyToken, isAdmin, crearJornada);

// ✏️ Editar el nombre de la jornada
router.patch('/admin/jornadas/:jornadaId', verifyToken, isAdmin, editarJornada);

// 🟢 Activar una jornada
router.patch('/admin/jornadas/:jornadaId/activar', verifyToken, isAdmin, activarJornada);

// 🗑️ Eliminar la jornada (y los pronósticos de sus partidos)
router.delete('/admin/jornadas/:jornadaId', verifyToken, isAdmin, eliminarJornada);

// ✏️ Editar un partido
router.patch(
  '/admin/jornadas/:jornadaId/partidos/:partidoId',
  verifyToken,
  isAdmin,
  editarPartido
);

// 🗑️ Eliminar un partido (y sus pronósticos)
router.delete(
  '/admin/jornadas/:jornadaId/partidos/:partidoId',
  verifyToken,
  isAdmin,
  eliminarPartido
);

// 🏁 Publicar el resultado oficial de un partido
router.patch(
  '/admin/jornadas/:jornadaId/partidos/:partidoId/resultado',
  verifyToken,
  isAdmin,
  publicarResultado
);

// ➕ Agregar un partido a una jornada existente
router.post(
  '/admin/jornadas/:jornadaId/partidos',
  verifyToken,
  isAdmin,
  agregarPartido
);

// 👑 PARTICIPANTES DE UNA JORNADA (con estado de pago)
router.get(
  '/jornadas/:jornadaId/participantes',
  verifyToken,
  isAdmin,
  listarParticipantes
);

// 👑 APROBAR / RECHAZAR PARTICIPANTE (estado de pago)
router.patch(
  '/jornadas/:jornadaId/aprobar-participante',
  verifyToken,
  isAdmin,
  aprobarParticipante
);

export default router;
