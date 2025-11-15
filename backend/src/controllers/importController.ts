import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import importService from '../services/importService';
import { createSuccessResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class ImportController {
  /**
   * POST /api/import/csv
   * Import products from CSV file
   */
  async importCSV(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400, 'NO_FILE');
      }

      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      const columnMapping = req.body.columnMapping
        ? JSON.parse(req.body.columnMapping)
        : undefined;

      const result = await importService.importFromCSV(
        req.file.buffer,
        req.user.id,
        columnMapping
      );

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/import/excel
   * Import products from Excel file
   */
  async importExcel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400, 'NO_FILE');
      }

      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      const columnMapping = req.body.columnMapping
        ? JSON.parse(req.body.columnMapping)
        : undefined;

      const result = await importService.importFromExcel(
        req.file.buffer,
        req.user.id,
        columnMapping
      );

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/import/history
   * Get import history
   */
  async getHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await importService.getImportHistory(page, limit);

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }
}

export default new ImportController();
