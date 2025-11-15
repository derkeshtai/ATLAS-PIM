import { Router } from 'express';
import cvaController from '../controllers/cvaController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Configuración CVA (solo admin)
router.post(
  '/config',
  authenticate,
  authorize('admin'),
  cvaController.saveConfig.bind(cvaController)
);

router.get(
  '/config',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.getConfig.bind(cvaController)
);

router.put(
  '/config/sync-options',
  authenticate,
  authorize('admin'),
  cvaController.updateSyncOptions.bind(cvaController)
);

router.delete(
  '/config',
  authenticate,
  authorize('admin'),
  cvaController.deleteConfig.bind(cvaController)
);

// Sincronización (admin y editor)
router.post(
  '/sync/full',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.fullSync.bind(cvaController)
);

router.post(
  '/sync/inventory',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.inventorySync.bind(cvaController)
);

router.post(
  '/sync/prices',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.priceSync.bind(cvaController)
);

router.post(
  '/discover',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.discoverProducts.bind(cvaController)
);

router.post(
  '/sync/catalogs',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.syncCatalogs.bind(cvaController)
);

// Consultas
router.get(
  '/sync/history',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.getSyncHistory.bind(cvaController)
);

router.get(
  '/sync/status/:syncId',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.getSyncStatus.bind(cvaController)
);

router.get(
  '/stats',
  authenticate,
  authorize('admin', 'editor'),
  cvaController.getStats.bind(cvaController)
);

// Test de conexión
router.post(
  '/test',
  authenticate,
  authorize('admin'),
  cvaController.testConnection.bind(cvaController)
);

export default router;
