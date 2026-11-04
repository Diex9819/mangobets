import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const {
  MONGODB_URI,
  ADMIN_NAME = 'Administrador',
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
} = process.env;

async function seedAdmin() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required');
  }

  if (ADMIN_PASSWORD.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  await mongoose.connect(MONGODB_URI);

  const existingAdmin = await User.findOne({ role: 'ADMIN' });
  if (existingAdmin) {
    console.log(`Admin already exists: ${existingAdmin.username}`);
    return;
  }

  const existingUsername = await User.findOne({ username: ADMIN_USERNAME });
  if (existingUsername) {
    throw new Error(`Username already exists: ${ADMIN_USERNAME}`);
  }

  const admin = await User.create({
    name: ADMIN_NAME,
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    role: 'ADMIN',
  });

  console.log(`Admin created: ${admin.username}`);
}

seedAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
