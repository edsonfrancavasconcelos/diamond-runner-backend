import { Router } from 'express';
import { SsoController } from '../controllers/SsoController.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/create-sso', authenticate, SsoController.create);

export default router;
