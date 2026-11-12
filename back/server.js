// 🔥 IMPORTACIONES
import express from "express";
import 'dotenv/config';
import cors from "cors";

import dbConnection from "./src/config/db.conf.js";
import { rejectDangerousKeys, securityHeaders, validateProductionEnv } from "./src/middlewares/securityMiddleware.js";

import authRoutes from "./src/routes/auth.js";
import quinielaRoutes from "./src/routes/quiniela.routes.js";

const app = express();
validateProductionEnv();
app.disable('x-powered-by');

// 🔌 CONEXIÓN DB
dbConnection();

// 🔧 MIDDLEWARES
app.use(securityHeaders);
app.use(express.json({ limit: '100kb' }));
app.use(rejectDangerousKeys);

app.use(cors({
  origin: [
    "http://localhost:4200",
    "https://mangobets.vercel.app"
  ],
  credentials: true
}));

app.get('/api', (req, res) => {
  res.json({ message: 'API MangoBets funcionando 🍊' });
});

// 🔥 RUTAS
app.use('/api/auth', authRoutes);
app.use('/api/quinielas', quinielaRoutes);

// 🚀 SERVER
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

export default app;
