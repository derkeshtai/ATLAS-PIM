import { Router } from 'express';
import aiCurationController from '../controllers/aiCurationController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Configuración (solo admin)
router.post(
  '/config',
  authenticate,
  authorize('admin'),
  aiCurationController.saveConfig.bind(aiCurationController)
);

router.get(
  '/config',
  authenticate,
  authorize('admin', 'editor'),
  aiCurationController.getConfig.bind(aiCurationController)
);

// Curación de productos (admin y editor)
router.post(
  '/curate/:productId',
  authenticate,
  authorize('admin', 'editor'),
  aiCurationController.curateProduct.bind(aiCurationController)
);

router.post(
  '/curate/bulk',
  authenticate,
  authorize('admin', 'editor'),
  aiCurationController.curateProductsBulk.bind(aiCurationController)
);

// Consultas
router.get(
  '/products/needing-curation',
  authenticate,
  authorize('admin', 'editor'),
  aiCurationController.getProductsNeedingCuration.bind(aiCurationController)
);

router.get(
  '/products/pending-approval',
  authenticate,
  authorize('admin', 'editor'),
  aiCurationController.getProductsPendingApproval.bind(aiCurationController)
);

// Aprobación/rechazo (admin y editor)
router.post(
  '/approve/:generatedContentId',
  authenticate,
  authorize('admin', 'editor'),
  aiCurationController.approveContent.bind(aiCurationController)
);

router.post(
  '/reject/:generatedContentId',
  authenticate,
  authorize('admin', 'editor'),
  aiCurationController.rejectContent.bind(aiCurationController)
);

// Test de conexión
router.post(
  '/test',
  authenticate,
  authorize('admin'),
  aiCurationController.testProvider.bind(aiCurationController)
);

export default router;
