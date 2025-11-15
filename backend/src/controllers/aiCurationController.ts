import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import aiCurationService from '../services/aiCurationService';
import { createSuccessResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class AICurationController {
  /**
   * POST /api/v1/ai/config
   * Configurar IA (Claude o LM Studio)
   */
  async saveConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const config = req.body;

      await aiCurationService.saveConfig(config);

      res.json(createSuccessResponse({
        message: 'AI configuration saved successfully'
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ai/config
   * Obtener configuración actual
   */
  async getConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const config = await aiCurationService.getConfig();

      if (!config) {
        return res.json(createSuccessResponse({
          configured: false,
          message: 'AI not configured'
        }));
      }

      // No enviar API key encriptada al cliente
      res.json(createSuccessResponse({
        configured: true,
        activeProvider: config.activeProvider,
        claudeModel: config.claudeModel,
        lmstudioEndpoint: config.lmstudioEndpoint,
        lmstudioModel: config.lmstudioModel,
        autoCurateNewProducts: config.autoCurateNewProducts,
        skipIcecatCurated: config.skipIcecatCurated,
        requireManualApproval: config.requireManualApproval,
        maxProductsPerBatch: config.maxProductsPerBatch,
        enableDescription: config.enableDescription,
        enableSEO: config.enableSEO,
        enableValidation: config.enableValidation
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ai/curate/:productId
   * Curar un producto
   */
  async curateProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const { curationType = 'all' } = req.body;

      const results = await aiCurationService.curateProduct(
        productId,
        curationType,
        req.user?.id
      );

      res.json(createSuccessResponse(results));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ai/curate/bulk
   * Curar múltiples productos
   */
  async curateProductsBulk(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { productIds, curationType = 'all' } = req.body;

      if (!productIds || !Array.isArray(productIds)) {
        throw new AppError('productIds array is required', 400, 'INVALID_INPUT');
      }

      const results = await aiCurationService.curateProducts(
        productIds,
        curationType,
        req.user?.id
      );

      res.json(createSuccessResponse(results));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ai/products/needing-curation
   * Obtener productos que necesitan curación
   */
  async getProductsNeedingCuration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;

      const products = await aiCurationService.getProductsNeedingCuration(limit);

      res.json(createSuccessResponse({
        products,
        count: products.length
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ai/products/pending-approval
   * Obtener productos pendientes de aprobación
   */
  async getProductsPendingApproval(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      const products = await aiCurationService.getProductsPendingApproval(limit);

      res.json(createSuccessResponse({
        products,
        count: products.length
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ai/approve/:generatedContentId
   * Aprobar contenido generado
   */
  async approveContent(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { generatedContentId } = req.params;
      const { approvedFields } = req.body;

      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      if (!approvedFields || !Array.isArray(approvedFields)) {
        throw new AppError('approvedFields array is required', 400, 'INVALID_INPUT');
      }

      await aiCurationService.approveGeneratedContent(
        generatedContentId,
        approvedFields,
        req.user.id
      );

      res.json(createSuccessResponse({
        message: 'Content approved successfully'
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ai/reject/:generatedContentId
   * Rechazar contenido generado
   */
  async rejectContent(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { generatedContentId } = req.params;
      const { notes } = req.body;

      if (!req.user?.id) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      await aiCurationService.rejectGeneratedContent(
        generatedContentId,
        req.user.id,
        notes
      );

      res.json(createSuccessResponse({
        message: 'Content rejected'
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ai/test
   * Test AI provider connection
   */
  async testProvider(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const provider = await aiCurationService.getProvider();
      const isAvailable = await provider.isAvailable();

      if (!isAvailable) {
        throw new AppError('AI provider not available', 503, 'PROVIDER_UNAVAILABLE');
      }

      const info = provider.getProviderInfo();

      res.json(createSuccessResponse({
        message: 'AI provider is available',
        provider: info
      }));
    } catch (error) {
      next(error);
    }
  }
}

export default new AICurationController();
