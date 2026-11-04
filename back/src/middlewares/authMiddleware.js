import jwt from "jsonwebtoken";
import User from "../models/User.js";

// 🔎 EXTRAER TOKEN del header Authorization: Bearer <token>
function obtenerToken(req) {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    return req.headers.authorization.split(' ')[1];
  }

  return null;
}

// 🔐 VERIFICAR TOKEN
export const verifyToken = async (req, res, next) => {
  try {
    const token = obtenerToken(req);

    if (!token) {
      return res.status(401).json({
        message: 'Acceso denegado, no hay token'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 traer usuario sin password
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        message: 'Usuario no encontrado'
      });
    }

    req.user = user;

    next();

  } catch (error) {
    return res.status(401).json({
      message: 'Token no válido o expirado'
    });
  }
};

// 🪪 VERIFICAR TOKEN (OPCIONAL)
// Para endpoints PÚBLICOS que se comportan distinto según haya sesión o no.
// Nunca rechaza la petición: si no hay token (o es inválido) simplemente
// deja req.user sin definir y sigue como usuario anónimo.
export const verifyTokenOptional = async (req, res, next) => {
  try {
    const token = obtenerToken(req);

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next();
    }

    req.user = user;

    next();

  } catch (error) {
    // Token inválido o expirado → se continúa como anónimo
    next();
  }
};

// 👑 SOLO ADMIN
export const isAdmin = (req, res, next) => {
  if (req.user?.role === 'ADMIN') {
    return next();
  }

  return res.status(403).json({
    message: 'Acceso denegado: solo ADMIN'
  });
};
