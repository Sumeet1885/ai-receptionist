import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
// Import controllers (will create next)
import * as calendarController from '../controllers/calendarController';

const router = Router();

router.get('/auth-url', requireAuth, calendarController.getAuthUrl);
router.get('/callback/:provider', calendarController.handleCallback);
router.get('/status', requireAuth, calendarController.getStatus);

// Server-to-server endpoints (for Edge Functions)
router.get('/availability', calendarController.getAvailability);
router.post('/book', calendarController.bookAppointment);

export default router;
