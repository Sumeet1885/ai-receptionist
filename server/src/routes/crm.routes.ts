import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as crmController from '../controllers/crmController';

const router = Router();

router.use(requireAuth);

router.get('/:botId/status', crmController.getStatus);
router.post('/:botId/connect', crmController.connect);
router.delete('/:botId/connect', crmController.disconnect);

export default router;
