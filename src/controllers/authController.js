import { User } from '../models/User.js';
// POSTGRES: import { User, RefreshToken } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  clearRefreshCookie,
  hashToken,
  readRefreshToken,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';

// Issues a fresh pair and records the refresh token hash against the user.
async function issueTokens(user, res) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await User.updateOne(
    { _id: user.id },
    { $push: { refreshTokens: { tokenHash: hashToken(refreshToken) } } }
  );
  /* POSTGRES: insert a new row instead of pushing onto an embedded array
  await RefreshToken.create({ userId: user.id, tokenHash: hashToken(refreshToken) });
  */

  setRefreshCookie(res, refreshToken);
  return { accessToken, refreshToken };
}

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with this email already exists');
  }
  /* POSTGRES: Sequelize has no exists(), so check with findOne
  if (await User.findOne({ where: { email } })) {
    throw ApiError.conflict('An account with this email already exists');
  }
  */

  const user = await User.create({ name, email, password }); // POSTGRES: same API, no change needed
  const { accessToken, refreshToken } = await issueTokens(user, res);

  res.status(201).json({
    success: true,
    message: 'Account created',
    data: { user: user.toJSON(), accessToken, refreshToken },
  });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  /* POSTGRES: use a scope instead of .select('+password')
  const user = await User.scope('withPassword').findOne({ where: { email } });
  */
  // Same message either way so we don't leak which emails are registered.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const { accessToken, refreshToken } = await issueTokens(user, res);

  res.json({
    success: true,
    message: 'Logged in',
    data: { user: user.toJSON(), accessToken, refreshToken },
  });
});

// POST /api/auth/refresh — rotates the refresh token
export const refresh = asyncHandler(async (req, res) => {
  const token = readRefreshToken(req);
  if (!token) throw ApiError.unauthorized('No refresh token provided');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  // POSTGRES: const user = await User.findByPk(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');

  const tokenHash = hashToken(token);
  const stored = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
  /* POSTGRES: query the table directly instead of scanning an array. This is more
     efficient — the full token list never has to be loaded into memory.
  const stored = await RefreshToken.findOne({ where: { tokenHash, userId: user.id } });
  */

  if (!stored) {
    // Token is validly signed but not on file — treat as reuse of a rotated
    // token and drop every session for this user.
    await User.updateOne({ _id: user.id }, { $set: { refreshTokens: [] } });
    // POSTGRES: await RefreshToken.destroy({ where: { userId: user.id } });
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Refresh token reuse detected, please log in again');
  }

  await User.updateOne({ _id: user.id }, { $pull: { refreshTokens: { tokenHash } } });
  // POSTGRES: await RefreshToken.destroy({ where: { tokenHash } });
  const tokens = await issueTokens(user, res);

  res.json({ success: true, message: 'Token refreshed', data: tokens });
});

// POST /api/auth/logout
export const logout = asyncHandler(async (req, res) => {
  const token = readRefreshToken(req);

  if (token) {
    await User.updateOne(
      { 'refreshTokens.tokenHash': hashToken(token) },
      { $pull: { refreshTokens: { tokenHash: hashToken(token) } } }
    );
    /* POSTGRES: delete a single row — the users table is never touched
    await RefreshToken.destroy({ where: { tokenHash: hashToken(token) } });
    */
  }

  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

// POST /api/auth/logout-all — protected, kills every session
export const logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $set: { refreshTokens: [] } });
  // POSTGRES: await RefreshToken.destroy({ where: { userId: req.user.id } });
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out of all devices' });
});

// GET /api/auth/me — protected
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toJSON() } });
});

// PATCH /api/auth/password — protected
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password +refreshTokens');
  // POSTGRES: const user = await User.scope('withPassword').findByPk(req.user.id);
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  user.password = newPassword;
  user.refreshTokens = []; // force re-login everywhere
  await user.save();
  /* POSTGRES: save the password, then delete every token in a separate call.
     save() triggers the beforeSave hook, which hashes the new password.
  user.password = newPassword;
  await user.save();
  await RefreshToken.destroy({ where: { userId: user.id } });
  */

  clearRefreshCookie(res);
  res.json({ success: true, message: 'Password updated, please log in again' });
});
