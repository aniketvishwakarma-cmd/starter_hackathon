import { Router } from 'express';
import {
  changePassword,
  login,
  logout,
  logoutAll,
  me,
  refresh,
  register,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from '../validators/authValidators.js';

const router = Router();

// Public
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Protected
router.get('/me', requireAuth, me);
router.post('/logout-all', requireAuth, logoutAll);
router.patch('/password', requireAuth, validate(changePasswordSchema), changePassword);

export default router;
