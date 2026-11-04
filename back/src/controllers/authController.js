import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { limpiarIntentosLogin } from "../middlewares/securityMiddleware.js";

// 🔐 TOKEN
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
};

// 🆕 REGISTER (admin crea usuarios)
export const register = async (req, res) => {
  try {
    const { name, username, password, role } = req.body;

    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'El usuario ya existe'
      });
    }

    // 🔥 validar rol
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'EMPLEADO';

    const user = await User.create({
      name,
      username,
      password,
      role: userRole
    });

    res.status(201).json({
      success: true,
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(400).json({
      success: false,
      error: 'No se pudo crear el usuario'
    });
  }
};

// 🔐 LOGIN
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // 🔥 importante traer password
    const user = await User.findOne({ username }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // 🧹 El login fue exitoso: se limpia el contador de intentos fallidos
    limpiarIntentosLogin(req);

    res.json({
      success: true,
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar sesión'
    });
  }
};
