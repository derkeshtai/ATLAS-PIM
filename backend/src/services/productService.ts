import pool from '../config/database';
import { Product, ProductWithDetails, ProductImage } from '../models/Product';
import { slugify, generateSKU, getPaginationParams, createPaginatedResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class ProductService {
  /**
   * Get all products with pagination
   */
  async getAllProducts(page?: number, limit?: number, filters?: any) {
    const { page: p, limit: l, offset } = getPaginationParams(page, limit);

    let query = `
      SELECT p.*,
             c.name as category_name,
             b.name as brand_name,
             COUNT(*) OVER() as total_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Apply filters
    if (filters?.is_active !== undefined) {
      query += ` AND p.is_active = $${paramIndex}`;
      params.push(filters.is_active);
      paramIndex++;
    }

    if (filters?.category_id) {
      query += ` AND p.category_id = $${paramIndex}`;
      params.push(filters.category_id);
      paramIndex++;
    }

    if (filters?.brand_id) {
      query += ` AND p.brand_id = $${paramIndex}`;
      params.push(filters.brand_id);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex} OR p.short_description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(l, offset);

    const result = await pool.query(query, params);

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return createPaginatedResponse(result.rows, total, p, l);
  }

  /**
   * Get product by ID with all related data
   */
  async getProductById(id: string): Promise<ProductWithDetails | null> {
    const productQuery = `
      SELECT p.*,
             c.name as category_name, c.slug as category_slug,
             b.name as brand_name, b.slug as brand_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.id = $1
    `;

    const productResult = await pool.query(productQuery, [id]);

    if (productResult.rows.length === 0) {
      return null;
    }

    const product = productResult.rows[0];

    // Get images
    const imagesQuery = 'SELECT * FROM product_images WHERE product_id = $1 ORDER BY position';
    const imagesResult = await pool.query(imagesQuery, [id]);

    // Get attributes
    const attributesQuery = `
      SELECT pa.*, a.name as attribute_name, a.slug as attribute_slug,
             av.value as attribute_value
      FROM product_attributes pa
      JOIN attributes a ON pa.attribute_id = a.id
      LEFT JOIN attribute_values av ON pa.attribute_value_id = av.id
      WHERE pa.product_id = $1
    `;
    const attributesResult = await pool.query(attributesQuery, [id]);

    // Get translations
    const translationsQuery = 'SELECT * FROM product_translations WHERE product_id = $1';
    const translationsResult = await pool.query(translationsQuery, [id]);

    return {
      ...product,
      images: imagesResult.rows,
      attributes: attributesResult.rows,
      translations: translationsResult.rows,
    };
  }

  /**
   * Get product by SKU
   */
  async getProductBySKU(sku: string): Promise<Product | null> {
    const query = 'SELECT * FROM products WHERE sku = $1';
    const result = await pool.query(query, [sku]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create new product
   */
  async createProduct(productData: Product): Promise<Product> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Generate SKU if not provided
      if (!productData.sku) {
        productData.sku = generateSKU();
      }

      // Generate slug from name
      if (!productData.slug) {
        productData.slug = slugify(productData.name);
      }

      const query = `
        INSERT INTO products (
          sku, name, slug, short_description, long_description,
          category_id, brand_id, price, sale_price, cost_price, currency,
          stock_quantity, low_stock_threshold, weight, width, height, depth,
          dimension_unit, weight_unit, meta_title, meta_description, meta_keywords,
          is_active, is_featured, is_new, visibility,
          supplier_name, supplier_sku, supplier_notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
        )
        RETURNING *
      `;

      const values = [
        productData.sku,
        productData.name,
        productData.slug,
        productData.short_description || null,
        productData.long_description || null,
        productData.category_id || null,
        productData.brand_id || null,
        productData.price || null,
        productData.sale_price || null,
        productData.cost_price || null,
        productData.currency || 'EUR',
        productData.stock_quantity || 0,
        productData.low_stock_threshold || 5,
        productData.weight || null,
        productData.width || null,
        productData.height || null,
        productData.depth || null,
        productData.dimension_unit || 'cm',
        productData.weight_unit || 'kg',
        productData.meta_title || null,
        productData.meta_description || null,
        productData.meta_keywords || null,
        productData.is_active !== undefined ? productData.is_active : true,
        productData.is_featured || false,
        productData.is_new || false,
        productData.visibility || 'catalog',
        productData.supplier_name || null,
        productData.supplier_sku || null,
        productData.supplier_notes || null,
      ];

      const result = await client.query(query, values);

      await client.query('COMMIT');

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update product
   */
  async updateProduct(id: string, productData: Partial<Product>): Promise<Product | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // If name is updated, update slug too
      if (productData.name && !productData.slug) {
        productData.slug = slugify(productData.name);
      }

      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(productData).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id') {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (fields.length === 0) {
        throw new AppError('No fields to update', 400, 'NO_UPDATE_DATA');
      }

      values.push(id);

      const query = `
        UPDATE products
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, values);

      await client.query('COMMIT');

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete product
   */
  async deleteProduct(id: string): Promise<boolean> {
    const query = 'DELETE FROM products WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [id]);

    return result.rows.length > 0;
  }

  /**
   * Add image to product
   */
  async addProductImage(imageData: ProductImage): Promise<ProductImage> {
    const query = `
      INSERT INTO product_images (
        product_id, url, thumbnail_url, alt_text, position,
        is_primary, file_size, width, height
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      imageData.product_id,
      imageData.url,
      imageData.thumbnail_url || null,
      imageData.alt_text || null,
      imageData.position || 0,
      imageData.is_primary || false,
      imageData.file_size || null,
      imageData.width || null,
      imageData.height || null,
    ];

    const result = await pool.query(query, values);

    return result.rows[0];
  }

  /**
   * Delete product image
   */
  async deleteProductImage(imageId: string): Promise<boolean> {
    const query = 'DELETE FROM product_images WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [imageId]);

    return result.rows.length > 0;
  }

  /**
   * Set primary image
   */
  async setPrimaryImage(productId: string, imageId: string): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Unset all primary images for this product
      await client.query(
        'UPDATE product_images SET is_primary = false WHERE product_id = $1',
        [productId]
      );

      // Set the new primary image
      await client.query(
        'UPDATE product_images SET is_primary = true WHERE id = $1 AND product_id = $2',
        [imageId, productId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Bulk update stock quantities
   */
  async bulkUpdateStock(updates: { sku: string; quantity: number }[]): Promise<number> {
    const client = await pool.connect();
    let updatedCount = 0;

    try {
      await client.query('BEGIN');

      for (const update of updates) {
        const result = await client.query(
          'UPDATE products SET stock_quantity = $1 WHERE sku = $2',
          [update.quantity, update.sku]
        );
        updatedCount += result.rowCount || 0;
      }

      await client.query('COMMIT');

      return updatedCount;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new ProductService();
