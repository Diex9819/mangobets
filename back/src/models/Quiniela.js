import mongoose from 'mongoose';

// 🏁 Resultado oficial publicado como marcador exacto (goles local vs visita).
// Se embebe como subdocumento { golesLocal, golesVisita }; si no está publicado
// el subdocumento no existe → el partido sigue sin resuelverse.
const resultadoSchema = new mongoose.Schema(
  {
    golesLocal: {
      type: Number,
      min: [0, 'golesLocal debe ser >= 0'],
      validate: {
        validator: Number.isInteger,
        message: 'golesLocal debe ser un entero >= 0'
      }
    },
    golesVisita: {
      type: Number,
      min: [0, 'golesVisita debe ser >= 0'],
      validate: {
        validator: Number.isInteger,
        message: 'golesVisita debe ser un entero >= 0'
      }
    },
  },
  { _id: false }
);

// ⚽ PARTIDO de una jornada (subdocumento embebido)
const partidoSchema = new mongoose.Schema(
  {
    local: {
      type: String,
      required: [true, 'local es requerido'],
      trim: true,
      maxlength: [80, 'local debe tener 80 caracteres o menos'],
    },
    visitante: {
      type: String,
      required: [true, 'visitante es requerido'],
      trim: true,
      maxlength: [80, 'visitante debe tener 80 caracteres o menos'],
    },
    horario: {
      type: Date,
      required: [true, 'horario es requerido'],
    },
    // 🏁 Resultado oficial ya publicado (marcador exacto). No publicado → no existe.
    resultadoOficial: resultadoSchema,
  },
  { _id: true }
);

// 📅 JORNADA
// Un conjunto de partidos con una sola jornada activa a la vez.
const jornadaSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, 'nombre es requerido'],
      trim: true,
      maxlength: [100, 'nombre debe tener 100 caracteres o menos'],
    },
    // 🟢 Marca la jornada vigente. El índice único parcial (abajo) garantiza
    // que jamás existan dos jornadas activas a la vez.
    activa: {
      type: Boolean,
      default: false,
    },
    partidos: [partidoSchema],
    esDemo: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// 🔒 Una sola jornada ACTIVA a la vez (protección anti doble activación a nivel DB)
// Mismo patrón que el singleton de CierreFinanciero.
jornadaSchema.index(
  { activa: 1 },
  {
    unique: true,
    partialFilterExpression: { activa: true },
    name: 'uniq_jornada_activa',
  }
);

// 🎯 PRONÓSTICO
// Un pronóstico por persona y partido. La persona puede ser:
//  - un USUARIO AUTENTICADO (userId) → se identifica con su cuenta
//  - un VISITANTE ANÓNIMO (alias)   → se identifica con el alias que escribe
// Si el partido ya tiene resultado oficial, el pronóstico deja de ser
// válido (ver el controlador).
const pronosticoSchema = new mongoose.Schema(
  {
    // 👤 Usuario autenticado. null en los pronósticos anónimos.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // 🪪 Alias del visitante anónimo (obligatorio si no hay userId).
    // Para usuarios autenticados se guarda su nombre, solo como referencia.
    alias: {
      type: String,
      trim: true,
      maxlength: [40, 'alias debe tener 40 caracteres o menos'],
      default: null,
    },
    // 🔑 Alias normalizado (minúsculas) → es el que usa el índice único,
    // para que "Juan" y "juan" sean la MISMA persona y no dos pronósticos.
    aliasKey: {
      type: String,
      default: null,
    },
    // ⚽ _id del partido embebido en Jornada.partidos (no tiene colección propia)
    partidoId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'partidoId es requerido'],
    },
    // ⚽ Marcador exacto pronosticado: goles del local vs goles del visitante
    golesLocal: {
      type: Number,
      required: [true, 'golesLocal es requerido'],
      min: [0, 'golesLocal debe ser >= 0'],
    },
    golesVisita: {
      type: Number,
      required: [true, 'golesVisita es requerido'],
      min: [0, 'golesVisita debe ser >= 0'],
    },
    // ✅ Estado de envío de la quiniela: true cuando el pronóstico fue
    //    confirmado formalmente por el usuario (flujo de 2 pasos: resumen → confirmar).
    enviado: {
      type: Boolean,
      default: false,
    },
    // 💳 Estado de pago del participante: PENDIENTE | APROBADO | RECHAZADO
    estadoPago: {
      type: String,
      enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO'],
      default: 'PENDIENTE',
    },
  },
  { timestamps: true }
);

// 🧹 Normaliza la identidad antes de validar
pronosticoSchema.pre('validate', function () {
  if (this.userId) {
    // Usuario autenticado: el alias es informativo, la identidad es el userId
    this.aliasKey = null;
    return;
  }

  if (!this.alias || !this.alias.trim()) {
    this.invalidate('alias', 'alias es requerido cuando no hay usuario autenticado');
    return;
  }

  this.aliasKey = this.alias.trim().toLowerCase();
});

// 🔒 Un solo pronóstico por usuario autenticado y partido → habilita el upsert seguro
pronosticoSchema.index(
  { userId: 1, partidoId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $type: 'objectId' } },
    name: 'uniq_pronostico_user_partido',
  }
);

// 🔒 Un solo pronóstico por alias anónimo y partido.
// El filtro parcial { userId: null } deja fuera a los usuarios autenticados
// (que ya están cubiertos por el índice de arriba).
pronosticoSchema.index(
  { aliasKey: 1, partidoId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: null },
    name: 'uniq_pronostico_alias_partido',
  }
);

export const Jornada = mongoose.model('Jornada', jornadaSchema);
export const Pronostico = mongoose.model('Pronostico', pronosticoSchema);

export default { Jornada, Pronostico };
