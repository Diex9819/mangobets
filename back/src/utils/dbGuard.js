const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function dbEsperada() {
  // Debe coincidir con el nombre de BD de .env / .env.example.
  // Se puede sobrescribir con SEED_EXPECTED_DB.
  return (process.env.SEED_EXPECTED_DB || 'mangobets-db').trim();
}

export function esProduccion() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

export function redactarUri(uri) {
  try {
    const url = new URL(uri);
    if (url.username) url.username = '****';
    if (url.password) url.password = '****';
    return url.toString();
  } catch {
    return '(uri inválida)';
  }
}

export function validarUriLocal(uri) {
  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    throw new Error('MONGODB_URI no definido. Abortando.');
  }

  let url;
  try {
    url = new URL(uri.trim());
  } catch {
    throw new Error(`MONGODB_URI no es una URI válida: ${redactarUri(uri)}`);
  }

  if (url.protocol !== 'mongodb:') {
    if (url.protocol === 'mongodb+srv:') {
      throw new Error('MONGODB_URI apunta a MongoDB Atlas (mongodb+srv://). Abortando: el seed SOLO trabaja contra MongoDB local.');
    }
    throw new Error(`Protocolo no soportado "${url.protocol}". Solo se permite mongodb:// local.`);
  }

  const host = url.hostname || '';
  if (!HOSTS_LOCALES.has(host.toLowerCase())) {
    throw new Error(`MONGODB_URI apunta a un host remoto ("${host}"). Abortando: el seed SOLO trabaja contra MongoDB local.`);
  }

  const db = decodeURIComponent((url.pathname || '').replace(/^\/+|\/+$/g, ''));
  const esperada = dbEsperada();
  if (!db) {
    throw new Error('MONGODB_URI no indica base de datos. Abortando.');
  }
  if (esperada && db !== esperada) {
    throw new Error(`Base de datos "${db}" no coincide con la esperada "${esperada}". Abortando.`);
  }

  return { host, db };
}

export function assertLocalOnly(uri) {
  if (esProduccion()) {
    throw new Error('NODE_ENV=production detectado. Abortando: el seed NO puede ejecutarse en producción.');
  }
  return validarUriLocal(uri);
}

export function cargarUriLocal() {
  const uri = process.env.MONGODB_URI;
  const info = assertLocalOnly(uri);
  return { uri, ...info };
}