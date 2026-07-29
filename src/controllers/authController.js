import { User } from '../models/User.js';
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

  setRefreshCookie(res, refreshToken);
  return { accessToken, refreshToken };
}

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = await User.create({ name, email, password });
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
  if (!user) throw ApiError.unauthorized('User no longer exists');

  const tokenHash = hashToken(token);
  const stored = user.refreshTokens.find((t) => t.tokenHash === tokenHash);

  if (!stored) {
    // Token is validly signed but not on file — treat as reuse of a rotated
    // token and drop every session for this user.
    await User.updateOne({ _id: user.id }, { $set: { refreshTokens: [] } });
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Refresh token reuse detected, please log in again');
  }

  await User.updateOne({ _id: user.id }, { $pull: { refreshTokens: { tokenHash } } });
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
  }

  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

// POST /api/auth/logout-all — protected, kills every session
export const logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $set: { refreshTokens: [] } });
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
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  user.password = newPassword;
  user.refreshTokens = []; // force re-login everywhere
  await user.save();

  clearRefreshCookie(res);
  res.json({ success: true, message: 'Password updated, please log in again' });
});
