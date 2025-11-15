import { Router } from 'express';
import multer from 'multer';
import imageController from '../controllers/imageController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
});

// Image upload routes (admin and editor only)
router.post(
  '/upload',
  authenticate,
  authorize('admin', 'editor'),
  upload.single('image'),
  imageController.uploadImage.bind(imageController)
);

router.post(
  '/from-url',
  authenticate,
  authorize('admin', 'editor'),
  imageController.processImageFromUrl.bind(imageController)
);

export default router;
