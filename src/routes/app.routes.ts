import { Router } from 'express';
import { AppController } from '../controllers/AppController.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/apps', authenticate, AppController.list);

export default router;
