import 'dotenv/config';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import User from '../src/models/User.js';

// 🎲 Alfabeto sin caracteres que se confunden entre sí (I/l, O/0, 1)
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

// 🔐 Genera una contraseña aleatoria fuerte
function generarPassword(length = 16) {
  let pass = '';

  for (let i = 0; i < length; i++) {
    pass += ALFABETO[crypto.randomInt(0, ALFABETO.length)];
  }

  return pass;
}

const {
  MONGODB_URI,
  ADMIN_NAME = 'Administrador',
  ADMIN_USERNAME = 'admin',
  ADMIN_PASSWORD,
} = process.env;

async function seedAdmin() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  const username = String(ADMIN_USERNAME).trim();
  const password = String(ADMIN_PASSWORD || generarPassword());

  if (!username) {
    throw new Error('El nombre de usuario del admin no puede estar vacío');
  }

  if (password.length < 6) {
    throw new Error('La contraseña del admin debe tener al menos 6 caracteres');
  }

  await mongoose.connect(MONGODB_URI);

  const existingAdmin = await User.findOne({ role: 'ADMIN' });

  if (existingAdmin) {
    console.log(`Admin ya existe: ${existingAdmin.username}`);
    return;
  }

  const existingUsername = await User.findOne({ username });

  if (existingUsername) {
    throw new Error(`Username already exists: ${username}`);
  }

  const admin = await User.create({
    name: String(ADMIN_NAME).trim() || 'Administrador',
    username,
    password,
    role: 'ADMIN',
  });

  console.log(`Admin creado: ${admin.username}`);
}

seedAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
