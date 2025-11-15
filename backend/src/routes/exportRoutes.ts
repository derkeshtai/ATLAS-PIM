import { Router } from 'express';
import exportController from '../controllers/exportController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Export routes (authentication required)
router.get('/prestashop/json', authenticate, exportController.exportJSON.bind(exportController));
router.get('/prestashop/csv', authenticate, exportController.exportCSV.bind(exportController));
router.get('/prestashop/product/:id', authenticate, exportController.getProduct.bind(exportController));
router.post('/prestashop/sync/:id', authenticate, exportController.syncProduct.bind(exportController));

export default router;
