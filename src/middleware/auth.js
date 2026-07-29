import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';

// Requires a valid `Authorization: Bearer <accessToken>` header.
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token');
  }

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid token';
    throw ApiError.unauthorized(message);
  }

  const user = await User.findById(payload.sub);
  // POSTGRES: const user = await User.findByPk(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');

  req.user = user;
  next();
});

// Use after requireAuth: requireRole('admin')
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }
    next();
  };
