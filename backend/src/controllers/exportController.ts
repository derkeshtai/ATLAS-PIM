import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import exportService from '../services/exportService';
import { createSuccessResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class ExportController {
  /**
   * GET /api/export/prestashop/json
   * Export products to Prestashop JSON format
   */
  async exportJSON(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filters = {
        category_id: req.query.category_id as string,
        brand_id: req.query.brand_id as string,
      };

      const products = await exportService.exportToPrestashop(filters);

      res.json(createSuccessResponse(products));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/export/prestashop/csv
   * Export products to Prestashop CSV format
   */
  async exportCSV(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filters = {
        category_id: req.query.category_id as string,
        brand_id: req.query.brand_id as string,
      };

      const csv = await exportService.exportToCSV(filters);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=products-export.csv');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/export/prestashop/product/:id
   * Get single product in Prestashop format
   */
  async getProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const product = await exportService.getProductForPrestashop(id);

      if (!product) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      res.json(createSuccessResponse(product));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/export/prestashop/sync/:id
   * Sync product with Prestashop via API
   */
  async syncProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const result = await exportService.syncWithPrestashop(id);

      res.json(
        createSuccessResponse({
          message: 'Product synced successfully',
          result,
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

export default new ExportController();
