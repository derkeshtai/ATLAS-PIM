import { Router } from 'express';
import multer from 'multer';
import importController from '../controllers/importController';
import xmlImportController from '../controllers/xmlImportController';
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

export default router;
