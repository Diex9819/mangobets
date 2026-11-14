import express from "express";
import { login } from "../controllers/authController.js";
import { loginRateLimit } from "../middlewares/securityMiddleware.js";

const router = express.Router();

// 🔓 LOGIN público
router.post('/login', loginRateLimit, login);

export default router;
