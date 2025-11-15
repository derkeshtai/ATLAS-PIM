import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import xmlImportService from '../services/xmlImportService';
import { createSuccessResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class XMLImportController {
  /**
   * POST /api/import/xml/supplier
   * Import products from supplier XML format
   */
  async importSupplierXML(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400, 'NO_FILE');
      }

      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      // Validate file is XML
      if (!req.file.originalname.endsWith('.xml') && req.file.mimetype !== 'text/xml' && req.file.mimetype !== 'application/xml') {
        throw new AppError('Invalid file type. Only XML files are allowed', 400, 'INVALID_FILE_TYPE');
      }

      const result = await xmlImportService.importFromSupplierXML(
        req.file.buffer,
        req.user.id
      );

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }
}

export default new XMLImportController();
