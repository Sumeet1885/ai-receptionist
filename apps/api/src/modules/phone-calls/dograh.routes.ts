import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as dograhController from './dograhController';

const router = Router();

router.use(requireAuth);

router.get('/numbers', dograhController.listNumbers);
router.get('/bots/:botId/status', dograhController.getStatus);
router.post('/bots/:botId/provision', dograhController.provisionBot);
router.post('/bots/:botId/assign-number', dograhController.assignNumber);
router.post('/bots/:botId/assign-outbound-number', dograhController.assignOutboundNumber);
router.post('/bots/:botId/unassign-number', dograhController.unassignNumber);
router.post('/bots/:botId/call', dograhController.callOut);
router.put('/bots/:botId/outbound-rate-limit', dograhController.updateOutboundRateLimit);
router.put('/bots/:botId/inbound-rate-limit', dograhController.updateInboundRateLimit);
router.get('/bots/:botId/calls', dograhController.listCalls);
router.post('/bots/:botId/sync', dograhController.syncCalls);
router.post('/bots/:botId/lines', dograhController.addPhoneLine);
router.delete('/bots/:botId/lines/:lineId', dograhController.removePhoneLine);
router.patch('/bots/:botId/lines/:lineId/primary', dograhController.setPrimaryPhoneLine);
router.post('/bots/:botId/generate-prompt', dograhController.generatePromptTemplate);

export default router;
