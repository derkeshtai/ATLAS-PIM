import { Router } from 'express';
import productController from '../controllers/productController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public routes (no authentication required for read operations)
// Uncomment the lines below if you want to make these endpoints public
// router.get('/', productController.getAllProducts.bind(productController));
// router.get('/:id', productController.getProductById.bind(productController));
// router.get('/sku/:sku', productController.getProductBySKU.bind(productController));

// Protected routes (authentication required)
router.get('/', authenticate, productController.getAllProducts.bind(productController));
router.get('/:id', authenticate, productController.getProductById.bind(productController));
router.get('/sku/:sku', authenticate, productController.getProductBySKU.bind(productController));

// Admin only routes
router.post('/', authenticate, authorize('admin', 'editor'), productController.createProduct.bind(productController));
router.put('/:id', authenticate, authorize('admin', 'editor'), productController.updateProduct.bind(productController));
router.delete('/:id', authenticate, authorize('admin'), productController.deleteProduct.bind(productController));

// Image management
router.post('/:id/images', authenticate, authorize('admin', 'editor'), productController.addProductImage.bind(productController));
router.delete('/:productId/images/:imageId', authenticate, authorize('admin', 'editor'), productController.deleteProductImage.bind(productController));
router.put('/:productId/images/:imageId/primary', authenticate, authorize('admin', 'editor'), productController.setPrimaryImage.bind(productController));

// Bulk operations
router.post('/bulk/stock', authenticate, authorize('admin', 'editor'), productController.bulkUpdateStock.bind(productController));

export default router;
