import 'dotenv/config';
import mongoose from 'mongoose';
import { cargarUriLocal } from '../src/utils/dbGuard.js';

// 📅 Migración de índices para PRONÓSTICOS con identidad dual.
//
// 1) Elimina el índice único (userId + partidoId) SIN filtro parcial.
//    Ese índice iba a colisionar entre los pronósticos anónimos: todos
//    tienen userId = null, así que dos aliases distintos sobre el mismo
//    partido provocarían un E11000.
//
// 2) Crea el índice de usuarios autenticados:
//    (userId, partidoId) único, PARCIAL { userId: { $type: 'objectId' } }.
//
// 3) Crea el índice de visitantes anónimos:
//    (aliasKey, partidoId) único, PARCIAL { userId: null }.

const INDICE_OBSOLETO = 'uniq_pronostico_user_partido';
const INDICE_USUARIO = 'uniq_pronostico_user_partido';
const INDICE_ALIAS = 'uniq_pronostico_alias_partido';

function log(...args) {
  console.log('[fix-indice-pronostico]', ...args);
}

function error(...args) {
  console.error('[fix-indice-pronostico][ERROR]', ...args);
}

async function main() {
  const { uri, db } = cargarUriLocal();
  log(`Conectando a MongoDB LOCAL (host localhost, db=${db})`);
  await mongoose.connect(uri);
  log('Conexión establecida.');

  const col = mongoose.connection.collection('pronosticos');
  const indicesActuales = await col.indexes();

  // 1) Eliminar el índice único global (rompía los pronósticos anónimos)
  const obsoleto = indicesActuales.find((idx) => idx.name === INDICE_OBSOLETO);

  if (obsoleto) {
    const esParcial = !!obsoleto.partialFilterExpression;
    log(
      `Eliminando índice "${INDICE_OBSOLETO}" (key=${JSON.stringify(obsoleto.key)}, ` +
      `unique=${!!obsoleto.unique}, partial=${esParcial})...`
    );

    if (esParcial) {
      // Ya es la versión correcta: solo se asegura el nombre/definición
      log('El índice ya tiene filtro parcial. Se recrea para garantizar la definición.');
    }

    await col.dropIndex(INDICE_OBSOLETO);
    log(`Índice "${INDICE_OBSOLETO}" eliminado correctamente.`);
  } else {
    log(`El índice "${INDICE_OBSOLETO}" no existe. Nada que eliminar.`);
  }

  // 2) Índice de usuarios autenticados
  await col.createIndex(
    { userId: 1, partidoId: 1 },
    {
      unique: true,
      partialFilterExpression: { userId: { $type: 'objectId' } },
      name: INDICE_USUARIO
    }
  );
  log(`Índice "${INDICE_USUARIO}" verificado/creado correctamente.`);

  // 3) Índice de visitantes anónimos
  await col.createIndex(
    { aliasKey: 1, partidoId: 1 },
    {
      unique: true,
      partialFilterExpression: { userId: null },
      name: INDICE_ALIAS
    }
  );
  log(`Índice "${INDICE_ALIAS}" verificado/creado correctamente.`);

  const indicesRestantes = await col.indexes();
  log('Índices vigentes de la colección pronosticos:');
  for (const idx of indicesRestantes) {
    log(
      `  ${idx.name}: key=${JSON.stringify(idx.key)}${idx.unique ? ' unique' : ''}` +
      `${idx.partialFilterExpression ? ` partial=${JSON.stringify(idx.partialFilterExpression)}` : ''}`
    );
  }

  // Verificación final
  const nombres = indicesRestantes.map((i) => i.name);

  if (!nombres.includes(INDICE_USUARIO) || !nombres.includes(INDICE_ALIAS)) {
    throw new Error('Verificación fallida: faltan los índices de pronostico.');
  }

  const usuario = indicesRestantes.find((i) => i.name === INDICE_USUARIO);
  const alias = indicesRestantes.find((i) => i.name === INDICE_ALIAS);

  if (!usuario.partialFilterExpression || !alias.partialFilterExpression) {
    throw new Error('Verificación fallida: los índices deben ser PARCIALES.');
  }

  log('Verificación OK: índices parciales vigentes (usuario + alias).');
}

main()
  .catch((err) => {
    error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
