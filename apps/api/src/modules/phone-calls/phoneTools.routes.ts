import { Router } from 'express';
import { requirePhoneToolsApiKey } from '../../middleware/phoneToolsAuth';
import { requireBotWorkspace } from '../../middleware/workspaceAccess';
import * as phoneToolsController from './phoneToolsController';

const router = Router();

router.use(requirePhoneToolsApiKey);
router.use('/:botId', requireBotWorkspace);

router.post('/:botId/pre-call', phoneToolsController.preCall);
router.post('/:botId/call-time-remaining', phoneToolsController.callTimeRemaining);
router.post('/:botId/check-availability', phoneToolsController.checkAvailability);
router.post('/:botId/book-appointment', phoneToolsController.bookAppointment);

export default router;
