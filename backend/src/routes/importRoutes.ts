import { Router } from 'express';
import multer from 'multer';
import importController from '../controllers/importController';
import xmlImportController from '../controllers/xmlImportController';
import icecatImportController from '../controllers/icecatImportController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for large imports
  },
});

// Import routes (admin and editor only)
router.post(
  '/csv',
  authenticate,
  authorize('admin', 'editor'),
  upload.single('file'),
  importController.importCSV.bind(importController)
);

router.post(
  '/excel',
  authenticate,
  authorize('admin', 'editor'),
  upload.single('file'),
  importController.importExcel.bind(importController)
);

router.get(
  '/history',
  authenticate,
  importController.getHistory.bind(importController)
);

// XML Import from supplier (admin and editor only)
router.post(
  '/xml/supplier',
  authenticate,
  authorize('admin', 'editor'),
  upload.single('file'),
  xmlImportController.importSupplierXML.bind(xmlImportController)
);

// Icecat integration routes (admin and editor only)

// Import from Icecat Excel file
router.post(
  '/icecat/excel',
  authenticate,
  authorize('admin', 'editor'),
  upload.single('file'),
  icecatImportController.importIcecatExcel.bind(icecatImportController)
);

// Sync single product from Icecat API by GTIN
router.post(
  '/icecat/sync/:gtin',
  authenticate,
  authorize('admin', 'editor'),
  icecatImportController.syncByGTIN.bind(icecatImportController)
);

// Sync multiple products from Icecat API by GTIN list
router.post(
  '/icecat/sync/bulk',
  authenticate,
  authorize('admin', 'editor'),
  icecatImportController.syncBulkByGTIN.bind(icecatImportController)
);

// Update existing product with fresh Icecat data
router.put(
  '/icecat/update/:productId',
  authenticate,
  authorize('admin', 'editor'),
  icecatImportController.updateProduct.bind(icecatImportController)
);

// Test Icecat API connection (for debugging)
router.get(
  '/icecat/test/:gtin',
  authenticate,
  authorize('admin'),
  icecatImportController.testIcecatApi.bind(icecatImportController)
);

export default router;
