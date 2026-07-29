import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(env.mongoUri);
  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

export async function disconnectDB() {
  await mongoose.connection.close();
}

/* ═══════════════════════════════════════════════════════════════════════════
    POSTGRESQL VERSION (for pgAdmin)

      How to switch:
    1. Run: npm install sequelize pg pg-hstore
    2. Run: npm uninstall mongoose
    3. Replace MONGO_URI with DATABASE_URL in the .env file
    4. Delete the Mongoose code above and uncomment the PostgreSQL code below
    5. Uncomment all "POSTGRESQL VERSION" blocks in the remaining files

  pgAdmin is only a GUI. Your application will connect to the PostgreSQL
  server, and you will be able to view your tables in pgAdmin under
  Schemas > public > Tables.
  ═══════════════════════════════════════════════════════════════════════════

import { Sequelize } from 'sequelize';
import { env } from './env.js';

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'postgres',
  logging: env.isProd ? false : (sql) => console.log(sql), // prints SQL queries in development
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  // Managed Postgres providers (Neon, Supabase, Render) require SSL
  dialectOptions: env.isProd ? { ssl: { require: true, rejectUnauthorized: false } } : {},
});

export async function connectDB() {
  // IMPORTANT: models must be imported before sync(), otherwise no tables get created.
  await import('../models/User.js');

  await sequelize.authenticate();

  // sync() is for development only — it auto-creates the schema from the models.
  // In production use proper migrations instead (npx sequelize-cli db:migrate).
  await sequelize.sync();

  console.log(`PostgreSQL connected: ${sequelize.getDatabaseName()}`);
  return sequelize;
}

export async function disconnectDB() {
  await sequelize.close();
}

═══════════════════════════════════════════════════════════════════════════ */
