import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import imageService from '../services/imageService';
import { createSuccessResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class ImageController {
  /**
   * POST /api/images/upload
   * Upload and process image
   */
  async uploadImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400, 'NO_FILE');
      }

      // Validate file type
      if (!imageService.isValidImage(req.file.mimetype)) {
        throw new AppError(
          'Invalid file type. Only images are allowed.',
          400,
          'INVALID_FILE_TYPE'
        );
      }

      // Validate file size
      if (!imageService.isValidSize(req.file.size)) {
        throw new AppError(
          'File size exceeds maximum allowed size',
          400,
          'FILE_TOO_LARGE'
        );
      }

      const result = await imageService.processImage(req.file);

      res.status(201).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/images/from-url
   * Process image from URL
   */
  async processImageFromUrl(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { url } = req.body;

      if (!url) {
        throw new AppError('Image URL is required', 400, 'MISSING_URL');
      }

      const result = await imageService.processImageFromUrl(url);

      res.status(201).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }
}

export default new ImageController();
