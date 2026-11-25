import 'dotenv/config';
import mongoose from 'mongoose';
import { cargarUriLocal } from '../src/utils/dbGuard.js';

// 📅 Migración de índices para JORNADAS con múltiples ACTIVAS.
//
// Elimina el índice único `uniq_jornada_activa` que impedía tener más de una
// jornada activa a la vez. Los datos y jornadas existentes no se tocan.

const INDICE_UNICO_ACTIVA = 'uniq_jornada_activa';

function log(...args) {
  console.log('[fix-indice-jornada]', ...args);
}

function error(...args) {
  console.error('[fix-indice-jornada][ERROR]', ...args);
}

async function main() {
  const { uri, db } = cargarUriLocal();
  log(`Conectando a MongoDB LOCAL (host localhost, db=${db})`);
  await mongoose.connect(uri);
  log('Conexión establecida.');

  const col = mongoose.connection.collection('jornadas');
  const indicesActuales = await col.indexes();

  const obsoleto = indicesActuales.find((idx) => idx.name === INDICE_UNICO_ACTIVA);

  if (!obsoleto) {
    log(`El índice "${INDICE_UNICO_ACTIVA}" no existe. Nada que eliminar.`);
  } else {
    log(`Eliminando índice "${INDICE_UNICO_ACTIVA}"...`);
    await col.dropIndex(INDICE_UNICO_ACTIVA);
    log(`Índice "${INDICE_UNICO_ACTIVA}" eliminado correctamente.`);
  }

  const restantes = (await col.indexes()).map((i) => i.name);
  log('Índices vigentes de la colección jornadas:');
  for (const nombre of restantes) {
    log(`  ${nombre}`);
  }
}

main()
  .catch((err) => {
    error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
