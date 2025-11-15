import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import productService from '../services/productService';
import { createSuccessResponse, createErrorResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class ProductController {
  /**
   * GET /api/products
   * Get all products with pagination and filters
   */
  async getAllProducts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters = {
        is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
        category_id: req.query.category_id as string,
        brand_id: req.query.brand_id as string,
        search: req.query.search as string,
      };

      const result = await productService.getAllProducts(page, limit, filters);

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/:id
   * Get product by ID
   */
  async getProductById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const product = await productService.getProductById(id);

      if (!product) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      res.json(createSuccessResponse(product));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/sku/:sku
   * Get product by SKU
   */
  async getProductBySKU(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { sku } = req.params;

      const product = await productService.getProductBySKU(sku);

      if (!product) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      res.json(createSuccessResponse(product));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/products
   * Create new product
   */
  async createProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const productData = req.body;

      // Validate required fields
      if (!productData.name) {
        throw new AppError('Product name is required', 400, 'MISSING_REQUIRED_FIELD');
      }

      const product = await productService.createProduct(productData);

      res.status(201).json(createSuccessResponse(product));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/products/:id
   * Update product
   */
  async updateProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const productData = req.body;

      const product = await productService.updateProduct(id, productData);

      if (!product) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      res.json(createSuccessResponse(product));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/products/:id
   * Delete product
   */
  async deleteProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const deleted = await productService.deleteProduct(id);

      if (!deleted) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      res.json(createSuccessResponse({ message: 'Product deleted successfully' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/products/:id/images
   * Add image to product
   */
  async addProductImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const imageData = {
        ...req.body,
        product_id: id,
      };

      const image = await productService.addProductImage(imageData);

      res.status(201).json(createSuccessResponse(image));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/products/:productId/images/:imageId
   * Delete product image
   */
  async deleteProductImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { imageId } = req.params;

      const deleted = await productService.deleteProductImage(imageId);

      if (!deleted) {
        throw new AppError('Image not found', 404, 'IMAGE_NOT_FOUND');
      }

      res.json(createSuccessResponse({ message: 'Image deleted successfully' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/products/:productId/images/:imageId/primary
   * Set primary image
   */
  async setPrimaryImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { productId, imageId } = req.params;

      await productService.setPrimaryImage(productId, imageId);

      res.json(createSuccessResponse({ message: 'Primary image updated successfully' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/products/bulk/stock
   * Bulk update stock quantities
   */
  async bulkUpdateStock(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const updates = req.body.updates;

      if (!Array.isArray(updates)) {
        throw new AppError('Updates must be an array', 400, 'INVALID_DATA');
      }

      const count = await productService.bulkUpdateStock(updates);

      res.json(
        createSuccessResponse({
          message: `${count} products updated successfully`,
          count,
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

export default new ProductController();
