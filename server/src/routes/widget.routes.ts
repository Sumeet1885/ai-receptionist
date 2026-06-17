import { Router } from 'express';
import { serveLoader, serveWidgetPage } from '../controllers/widgetController';
import { widgetRateLimit } from '../middleware/rateLimit';

const router = Router();

router.use(widgetRateLimit);

// Universal loader script — served from <script src="/widget/loader.js" data-bot-id="...">
router.get('/loader.js', serveLoader);

// Widget HTML page — loaded inside an iframe by the loader
router.get('/:botId', serveWidgetPage);

export default router;
