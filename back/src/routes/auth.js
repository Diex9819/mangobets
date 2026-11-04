import express from "express";
import { register, login } from "../controllers/authController.js";
import { verifyToken, isAdmin } from "../middlewares/authMiddleware.js";
import { loginRateLimit } from "../middlewares/securityMiddleware.js";

const router = express.Router();

// 🔐 SOLO ADMIN puede crear usuarios (meseros)
router.post('/register', verifyToken, isAdmin, register);

// 🔓 LOGIN público
router.post('/login', loginRateLimit, login);

export default router;
