import { Router } from 'express';
import { requirePhoneToolsApiKey } from '../../middleware/phoneToolsAuth';
import * as phoneToolsController from './phoneToolsController';

const router = Router();

router.use(requirePhoneToolsApiKey);

router.post('/:botId/pre-call', phoneToolsController.preCall);
router.post('/:botId/check-availability', phoneToolsController.checkAvailability);
router.post('/:botId/book-appointment', phoneToolsController.bookAppointment);

export default router;
