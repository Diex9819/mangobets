const loginAttempts = new Map();
const pronosticoAttempts = new Map();

export const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};

export const validateProductionEnv = () => {
  const errors = [];

  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  }

  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
    if (!process.env.MONGODB_URI) errors.push('MONGODB_URI is required in production');
    if (!process.env.FRONTEND_URL) errors.push('FRONTEND_URL is required in production');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join(', ')}`);
  }
};

export const rejectDangerousKeys = (req, res, next) => {
  if (hasDangerousKey(req.body) || hasDangerousKey(req.query) || hasDangerousKey(req.params)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  next();
};

export const loginRateLimit = (req, res, next) => {
  const windowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
  const maxAttempts = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5;
  const now = Date.now();
  const username = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
  const key = `${req.ip}:${username}`;
  const current = loginAttempts.get(key);

  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (current.count >= maxAttempts) {
    return res.status(429).json({
      success: false,
      message: 'Demasiados intentos. Intenta de nuevo más tarde'
    });
  }

  current.count += 1;
  loginAttempts.set(key, current);
  next();
};

// 🧹 Limpia el contador de intentos de login.
// Se llama cuando el login es EXITOSO: así solo cuentan los intentos
// fallidos y un usuario que entra bien no queda bloqueado después.
export function limpiarIntentosLogin(req) {
  const username = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
  loginAttempts.delete(`${req.ip}:${username}`);
}

// 🎯 LÍMITE DE INTENTOS PARA PRONÓSTICOS
// El guardado de pronósticos es PÚBLICO (no exige sesión), así que necesita
// un freno por IP para que un script no pueda llenar la colección.
// A diferencia de loginRateLimit, NO se descuenta en los aciertos: cada
// pronóstico guardado cuenta como intento (guardar es la operación cara).
export const pronosticoRateLimit = (req, res, next) => {
  const windowMs = Number(process.env.PRONOSTICO_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
  const maxAttempts = Number(process.env.PRONOSTICO_RATE_LIMIT_MAX) || 60;
  const now = Date.now();
  const key = req.ip || 'desconocido';

  // 🧹 Limpieza de entradas vencidas (evita que el Map crezca sin control)
  if (pronosticoAttempts.size > 500) {
    for (const [k, v] of pronosticoAttempts) {
      if (v.resetAt <= now) pronosticoAttempts.delete(k);
    }
  }

  const current = pronosticoAttempts.get(key);

  if (!current || current.resetAt <= now) {
    pronosticoAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (current.count >= maxAttempts) {
    return res.status(429).json({
      success: false,
      message: 'Demasiados pronósticos enviados. Intenta de nuevo más tarde'
    });
  }

  current.count += 1;
  pronosticoAttempts.set(key, current);
  next();
};

function hasDangerousKey(value) {  if (!value || typeof value !== 'object') return false;

  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }

    if (hasDangerousKey(value[key])) {
      return true;
    }
  }

  return false;
}
