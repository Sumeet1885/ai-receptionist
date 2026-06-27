import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as dograhController from './dograhController';

const router = Router();

router.use(requireAuth);

router.get('/numbers', dograhController.listNumbers);
router.get('/bots/:botId/status', dograhController.getStatus);
router.post('/bots/:botId/provision', dograhController.provisionBot);
router.post('/bots/:botId/assign-number', dograhController.assignNumber);
router.post('/bots/:botId/call', dograhController.callOut);
router.get('/bots/:botId/calls', dograhController.listCalls);
router.post('/bots/:botId/sync', dograhController.syncCalls);

export default router;
