import mongoose from 'mongoose';
import 'dotenv/config';

// 🗑️ Colecciones que queremos conservar (auth + quinielas)
const KEEP_COLLECTIONS = ['users', 'jornadas', 'pronosticos'];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mangobets-db');

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  for (const col of collections) {
    if (KEEP_COLLECTIONS.includes(col.name)) continue;
    await db.collection(col.name).drop();
    console.log(`🗑️  Colección eliminada: ${col.name}`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error('Error limpiando colecciones legacy:', error);
  process.exit(1);
});
