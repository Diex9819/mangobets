import mongoose from "mongoose";
import dotenv from "dotenv";

import { dropLegacyIndiceJornadaActiva } from "./../models/Quiniela.js";

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/mangobets-db",
    );
    console.log("MongoDB conectado:", conn.connection.db.databaseName);

    // 🔄 Limpieza de índice legado (uniq_jornada_activa): solo si existe,
    //    para permitir múltiples jornadas activas al desplegar en producción.
    await dropLegacyIndiceJornadaActiva();
  } catch (error) {
    console.error("Error conectando a MongoDB:", error);
    process.exit(1);
  }
};

export default connectDB;