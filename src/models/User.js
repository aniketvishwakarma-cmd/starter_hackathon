import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 60,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never returned unless explicitly asked for
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    // Hashed refresh tokens — one per active device/session.
    refreshTokens: {
      type: [
        {
          tokenHash: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.refreshTokens;
        return ret;
      },
    },
  }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model('User', userSchema);

/* ═══════════════════════════════════════════════════════════════════════════
   POSTGRESQL VERSION (Sequelize)

   The biggest difference: in MongoDB, refreshTokens lived as an array INSIDE
   the user document. SQL has no nested arrays, so it becomes a separate
   `refresh_tokens` table linked back to the user by a foreign key (one-to-many).
   ═══════════════════════════════════════════════════════════════════════════

import { DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '../config/db.js';

const SALT_ROUNDS = 12;

export const User = sequelize.define(
  'User',
  {
    // Mongo used an ObjectId for _id; a UUID is used here so ids can't be guessed.
    // For a simple auto-increment instead:
    //   { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(60),
      allowNull: false,
      validate: { len: { args: [2, 60], msg: 'Name must be 2-60 characters' } },
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: { msg: 'Enter a valid email' } },
      // Equivalent of Mongoose's lowercase: true + trim: true
      set(value) {
        this.setDataValue('email', String(value).trim().toLowerCase());
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      allowNull: false,
      defaultValue: 'user',
    },
  },
  {
    tableName: 'users',
    timestamps: true, // createdAt / updatedAt columns

    // Equivalent of Mongoose's `select: false`.
    // A normal query won't return the password; when you need it:
    //   User.scope('withPassword').findOne(...)
    defaultScope: { attributes: { exclude: ['password'] } },
    scopes: { withPassword: { attributes: { include: ['password'] } } },

    hooks: {
      // Same idea as Mongoose's userSchema.pre('save')
      beforeSave: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, SALT_ROUNDS);
        }
      },
    },
  }
);

// Mongoose: userSchema.methods.comparePassword
User.prototype.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Same as the Mongoose toJSON transform — the password must never reach a response
User.prototype.toJSON = function toJSON() {
  const values = { ...this.get({ plain: true }) };
  delete values.password;
  return values;
};

// ── refresh_tokens table ──────────────────────────────────────────────────
export const RefreshToken = sequelize.define(
  'RefreshToken',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // A SHA-256 hex digest is always exactly 64 characters
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    tableName: 'refresh_tokens',
    timestamps: true,
    updatedAt: false, // a token is only ever created or deleted, never updated
    indexes: [{ fields: ['userId'] }], // keeps "all tokens for this user" lookups fast
  }
);

// onDelete CASCADE: deleting a user automatically deletes all of their refresh tokens
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

═══════════════════════════════════════════════════════════════════════════ */
