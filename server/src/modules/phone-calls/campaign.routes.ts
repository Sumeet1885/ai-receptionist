import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth';
import * as campaignController from './campaignController';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
      'application/vnd.ms-excel',                                           
      'text/csv',
      'application/csv',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed.'));
    }
  },
});

router.post('/bots/:botId/upload', upload.single('file'), campaignController.uploadCampaign);
router.get('/bots/:botId', campaignController.listCampaigns);

router.get('/:campaignId', campaignController.getCampaign);
router.post('/:campaignId/start', campaignController.startCampaignRoute);
router.post('/:campaignId/pause', campaignController.pauseCampaignRoute);
router.get('/:campaignId/export', campaignController.exportCampaign);
router.delete('/:campaignId', campaignController.deleteCampaignRoute);

export default router;
