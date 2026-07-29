import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let { statusCode = 500, message } = err;
  let details = err.details;

  // Duplicate key (e.g. email already registered)
  if (err.code === 11000) {
    statusCode = 409;
    message = `${Object.keys(err.keyValue).join(', ')} already in use`;
  }

  // Mongoose schema validation
  if (err.name === 'ValidationError') {
    statusCode = 400;
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = 'Validation failed';
  }

  // Malformed ObjectId in a route param
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  }

  /* ─── POSTGRES: Sequelize uses different error names ──────────────────────
     Replace the three Mongoose blocks above with these three.

  // UNIQUE constraint violated (e.g. email already registered) — Mongo's 11000 equivalent
  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    details = err.errors.map((e) => ({ field: e.path, message: `${e.path} already in use` }));
    message = 'Already in use';
  }

  // Model validation failed (allowNull, isEmail, len, and so on)
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    details = err.errors.map((e) => ({ field: e.path, message: e.message }));
    message = 'Validation failed';
  }

  // Malformed UUID or type mismatch — Mongo's CastError equivalent
  if (err.name === 'SequelizeDatabaseError' || err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Invalid request data';
  }
  ─────────────────────────────────────────────────────────────────────────── */

  if (statusCode >= 500) console.error(err);

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && env.isProd ? 'Something went wrong' : message,
    ...(details ? { errors: details } : {}),
    ...(env.isProd ? {} : { stack: err.stack }),
  });
}
