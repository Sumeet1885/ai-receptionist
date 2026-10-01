import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as calendarController from '../controllers/calendarController';

const router = Router();

router.get('/auth-url', requireAuth, calendarController.getAuthUrl);
router.get('/callback/:provider', calendarController.handleCallback);
router.get('/status', requireAuth, calendarController.getStatus);
router.delete('/connection', requireAuth, calendarController.disconnectConnection);


export default router;
