import { Router } from 'express';
import authRoutes from './authRoutes.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use('/auth', authRoutes);

// Example protected route — copy this pattern for your hackathon features.
router.get('/protected', requireAuth, (req, res) => {
  res.json({ success: true, message: `Hello ${req.user.name}, you are authenticated.` });
});

// Example admin-only route.
router.get('/admin', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ success: true, message: 'Admin area' });
});

export default router;
