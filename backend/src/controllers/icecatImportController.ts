import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import icecatExcelService from '../services/icecatExcelService';
import icecatApiService from '../services/icecatApiService';
import { createSuccessResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class IcecatImportController {
  /**
   * POST /api/import/icecat/excel
   * Import products from Icecat Excel file
   */
  async importIcecatExcel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400, 'NO_FILE');
      }

      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      // Validate file is Excel
      const validTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
      ];

      const validExtensions = ['.xls', '.xlsx'];
      const hasValidType = validTypes.includes(req.file.mimetype);
      const hasValidExtension = validExtensions.some(ext => req.file!.originalname.toLowerCase().endsWith(ext));

      if (!hasValidType && !hasValidExtension) {
        throw new AppError('Invalid file type. Only Excel files (.xls, .xlsx) are allowed', 400, 'INVALID_FILE_TYPE');
      }

      const result = await icecatExcelService.importFromIcecatExcel(
        req.file.buffer,
        req.user.id
      );

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/import/icecat/sync/:gtin
   * Sync single product from Icecat API by GTIN
   */
  async syncByGTIN(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      const { gtin } = req.params;

      if (!gtin) {
        throw new AppError('GTIN is required', 400, 'GTIN_REQUIRED');
      }

      const result = await icecatApiService.syncProductByGTIN(gtin, req.user.id);

      if (!result.success) {
        throw new AppError(
          result.error || 'Failed to sync product from Icecat',
          400,
          'SYNC_FAILED'
        );
      }

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/import/icecat/sync/bulk
   * Sync multiple products from Icecat API by GTIN list
   * Body: { gtins: ["1234567890123", "9876543210987", ...] }
   */
  async syncBulkByGTIN(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      const { gtins } = req.body;

      if (!gtins || !Array.isArray(gtins) || gtins.length === 0) {
        throw new AppError('GTINs array is required', 400, 'GTINS_REQUIRED');
      }

      if (gtins.length > 100) {
        throw new AppError('Maximum 100 GTINs allowed per request', 400, 'TOO_MANY_GTINS');
      }

      const results = await icecatApiService.syncProductsByGTINList(gtins, req.user.id);

      const summary = {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };

      res.json(createSuccessResponse(summary));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/import/icecat/update/:productId
   * Update existing product with fresh Icecat data
   */
  async updateProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      const { productId } = req.params;

      if (!productId) {
        throw new AppError('Product ID is required', 400, 'PRODUCT_ID_REQUIRED');
      }

      const result = await icecatApiService.updateProductWithIcecatData(productId);

      if (!result.success) {
        throw new AppError(
          result.error || 'Failed to update product from Icecat',
          400,
          'UPDATE_FAILED'
        );
      }

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/import/icecat/test/:gtin
   * Test Icecat API connection and fetch product data (without saving)
   */
  async testIcecatApi(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { gtin } = req.params;

      if (!gtin) {
        throw new AppError('GTIN is required', 400, 'GTIN_REQUIRED');
      }

      const productData = await icecatApiService.fetchProductByGTIN(gtin);

      res.json(createSuccessResponse({
        message: 'Successfully fetched from Icecat API',
        data: productData
      }));
    } catch (error) {
      next(error);
    }
  }
}

export default new IcecatImportController();
