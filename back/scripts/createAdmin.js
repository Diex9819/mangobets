import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

// 👑 CREAR / ACTUALIZAR UN USUARIO ADMINISTRADOR
//
// - Usa el modelo User (la contraseña se encripta con bcrypt en el hook pre('save')).
// - Si el usuario ya existe, ACTUALIZA su contraseña para poder entrar seguro.
// - Imprime al final el usuario y la contraseña EN TEXTO PLANO para poder copiarlos.
//
// ── Formas de invocarlo ──
//   npm run create:admin
//   node scripts/createAdmin.js --username=admin --password=MiClave123
//   node scripts/createAdmin.js --username=otro --name="Otro Admin"
//
//   Variables de entorno (tienen prioridad sobre los defaults, y los args
//   de la línea de comandos pisan a las variables de entorno):
//     ADMIN_NAME, ADMIN_USERNAME, ADMIN_PASSWORD
//
//   ⚠️ En Windows con PowerShell, "npm run create:admin -- --username=x" NO
//      pasa los argumentos (es el wrapper npm.ps1 el que los descarta).
//      Usá directamente:  node scripts/createAdmin.js --username=x
//
//   Si no se define ADMIN_PASSWORD, se genera una contraseña aleatoria
//   de 16 caracteres y se imprime.

const {
  MONGODB_URI,
  ADMIN_NAME = 'Administrador',
  ADMIN_USERNAME = 'admin',
  ADMIN_PASSWORD,
} = process.env;

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

// 📦 Lee los overrides de la línea de comandos (--clave=valor)
function leerArgs(argv) {
  const args = {};

  for (const arg of argv) {
    const match = /^--([^=]+)=?(.*)$/.exec(arg);

    if (match) {
      args[match[1]] = match[2] || true;
    }
  }

  return args;
}

const args = leerArgs(process.argv.slice(2));

// ❓ AYUDA
if (args.help || args.h) {
  console.log(`
👑 createAdmin.js — crea o actualiza el usuario Administrador

  Uso:
    node scripts/createAdmin.js [--username=valor] [--password=valor] [--name=valor]

  Opciones:
    --username=valor   Nombre de usuario (default: ADMIN_USERNAME o "admin")
    --password=valor   Contraseña    (default: ADMIN_PASSWORD o una aleatoria de 16 caracteres)
    --name=valor       Nombre visible (default: ADMIN_NAME o "Administrador")
    --help             Muestra esta ayuda

  Variables de entorno (opcionales):
    MONGODB_URI, ADMIN_NAME, ADMIN_USERNAME, ADMIN_PASSWORD, SEED_EXPECTED_DB

  Ejemplos:
    node scripts/createAdmin.js
    node scripts/createAdmin.js --username=admin --password=MiClave123
    node scripts/createAdmin.js --username=otro --name="Otro Admin"
`);
  process.exit(0);
}

const username = String(args.username || ADMIN_USERNAME).trim();
const name = String(args.name || ADMIN_NAME).trim();
const password = String(args.password || ADMIN_PASSWORD || generarPassword());

// 🔎 Base de datos esperada (para avisar si no es la correcta)
const BD_ESPERADA = (process.env.SEED_EXPECTED_DB || 'mangobets-db').trim();

async function createAdmin() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required (revisá el archivo .env)');
  }

  if (!username) {
    throw new Error('El nombre de usuario no puede estar vacío');
  }

  if (password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres');
  }

  await mongoose.connect(MONGODB_URI);

  const dbName = mongoose.connection.name;

  if (dbName !== BD_ESPERADA) {
    console.warn(
      `\n⚠️  ATENCIÓN: te conectaste a la base "${dbName}" pero se esperaba "${BD_ESPERADA}".\n` +
      '    Si no es intencional, revisá MONGODB_URI en el .env.\n'
    );
  }

  // 🔍 ¿Existe ya el usuario con ese username?
  const existente = await User.findOne({ username });

  let admin;
  let accion;

  if (existente) {
    // ♻️ ACTUALIZAR: se reescribe la contraseña (el hook pre('save') la hashea)
    existente.name = name;
    existente.role = 'ADMIN';
    existente.password = password;

    await existente.save();

    admin = existente;
    accion = 'ACTUALIZADO';
  } else {
    // 🆕 CREAR
    admin = await User.create({
      name,
      username,
      password,
      role: 'ADMIN',
    });

    accion = 'CREADO';
  }

  // ✅ Autocomprobación: la contraseña guardada debe permitir el login
  const verificacion = await User.findById(admin._id).select('+password');
  const coincide = await verificacion.comparePassword(password);

  if (!coincide) {
    throw new Error('La contraseña no pudo verificarse contra el hash guardado');
  }

  // 📋 ¿Hay otros administradores?
  const totalAdmins = await User.countDocuments({ role: 'ADMIN' });

  // ═══════════════════════════════════════
  // 📋 RESUMEN PARA COPIAR
  // ═══════════════════════════════════════

  // 📏 Arma una línea del recuadro (texto sin emoji para que el pad sea exacto)
  const ANCHO = 42;

  function linea(texto) {
    const relleno = ' '.repeat(Math.max(0, ANCHO - texto.length));
    return `║${texto}${relleno}║`;
  }

  // 🏷️ Alinea las etiquetas del resumen
  const ETIQUETAS = {
    usuario: 'Usuario:',
    password: 'Contraseña:',
    nombre: 'Nombre:',
    rol: 'Rol:',
    db: 'Base de datos:',
  };

  const LARGO_ETIQUETA = Math.max(...Object.values(ETIQUETAS).map((e) => e.length)) + 1;

  const dato = (etiqueta, valor) => `   ${etiqueta.padEnd(LARGO_ETIQUETA)}${valor}`;

  console.log('');
  console.log('╔' + '═'.repeat(ANCHO) + '╗');
  console.log(linea(''));
  console.log(linea('  👑  ADMINISTRADOR ' + accion));
  console.log(linea(''));
  console.log('╚' + '═'.repeat(ANCHO) + '╝');
  console.log('');
  console.log(dato(ETIQUETAS.usuario, username));
  console.log(dato(ETIQUETAS.password, password));
  console.log(dato(ETIQUETAS.nombre, name));
  console.log(dato(ETIQUETAS.rol, 'ADMIN'));
  console.log(dato(ETIQUETAS.db, dbName));
  console.log('');
  console.log('   👉 Iniciá sesión con esos datos.');
  console.log(`      Frontend: ${process.env.FRONTEND_URL || 'http://localhost:4200'}`);
  console.log(`      API:      ${process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:3001'}/api/auth/login`);
  console.log('');

  if (totalAdmins > 1) {
    console.log(`   ℹ️  Hay ${totalAdmins} usuarios con rol ADMIN en la base.`);
    console.log('');
  }

  console.log('   🔐 La contraseña se guardó encriptada con bcrypt (10 rondas de salt).');
  console.log('');
}

createAdmin()
  .catch((error) => {
    console.error('');
    console.error(`❌ Error: ${error.message}`);
    console.error('');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
