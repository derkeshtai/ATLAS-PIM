import { parseString } from 'xml2js';
import pool from '../config/database';
import productService from './productService';
import imageService from './imageService';
import { slugify } from '../utils/helpers';
import { Product } from '../models/Product';

export interface XMLImportResult {
  total_items: number;
  successful_items: number;
  failed_items: number;
  errors: Array<{ item: string; error: string; data?: any }>;
  categories_created: number;
  brands_created: number;
  warehouses_synced: number;
}

export class XMLImportService {
  /**
   * Import products from supplier XML format
   */
  async importFromSupplierXML(
    xmlBuffer: Buffer,
    userId: string
  ): Promise<XMLImportResult> {
    const result: XMLImportResult = {
      total_items: 0,
      successful_items: 0,
      failed_items: 0,
      errors: [],
      categories_created: 0,
      brands_created: 0,
      warehouses_synced: 0,
    };

    // Create import history record
    const historyQuery = `
      INSERT INTO import_history (filename, file_type, status, imported_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const historyResult = await pool.query(historyQuery, [
      'supplier-import.xml',
      'xml',
      'processing',
      userId,
    ]);

    const importId = historyResult.rows[0].id;

    try {
      // Parse XML
      const xmlData: any = await new Promise((resolve, reject) => {
        parseString(xmlBuffer.toString(), (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      const items = xmlData.articulos?.item || [];
      result.total_items = items.length;

      // Process each item
      for (let i = 0; i < items.length; i++) {
        try {
          const item = items[i];
          await this.processSupplierItem(item, result);
          result.successful_items++;
        } catch (error: any) {
          result.failed_items++;
          result.errors.push({
            item: items[i].clave?.[0] || `Item ${i + 1}`,
            error: error.message,
            data: items[i],
          });
        }
      }

      // Update import history
      await pool.query(
        `UPDATE import_history
         SET status = $1, total_rows = $2, successful_rows = $3,
             failed_rows = $4, error_log = $5, completed_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [
          'completed',
          result.total_items,
          result.successful_items,
          result.failed_items,
          JSON.stringify(result.errors),
          importId,
        ]
      );

      return result;
    } catch (error: any) {
      // Update import history with error
      await pool.query(
        `UPDATE import_history
         SET status = $1, error_log = $2, completed_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        ['failed', error.message, importId]
      );

      throw error;
    }
  }

  /**
   * Process a single supplier item
   */
  private async processSupplierItem(
    item: any,
    result: XMLImportResult
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Extract data from XML item
      const supplierSKU = this.extractValue(item.clave);
      const manufacturerCode = this.extractValue(item.codigo_fabricante);
      const name = this.extractValue(item.descripcion);
      const brandName = this.extractValue(item.marca);
      const categoryGroup = this.extractValue(item.grupo);
      const categorySubgroup = this.extractValue(item.subgrupo);
      const solution = this.extractValue(item.solucion);
      const warranty = this.extractValue(item.garantia);
      const productClass = this.extractValue(item.clase);
      const stockAvailable = parseInt(this.extractValue(item.disponible) || '0');
      const price = parseFloat(this.extractValue(item.precio) || '0');
      const currency = this.mapCurrency(this.extractValue(item.moneda));
      const technicalSheet = this.extractValue(item.ficha_tecnica);
      const commercialSheet = this.extractValue(item.ficha_comercial);
      const imageUrl = this.extractValue(item.imagen);
      const exchangeRate = parseFloat(this.extractValue(item.tipocambio) || '1');

      // Get or create brand
      const brandId = await this.getOrCreateBrand(client, brandName);
      if (brandId) result.brands_created++;

      // Get or create category (using grupo/subgrupo hierarchy)
      const categoryId = await this.getOrCreateCategory(
        client,
        categoryGroup,
        categorySubgroup
      );
      if (categoryId) result.categories_created++;

      // Check if product exists by supplier SKU
      const existingProduct = await client.query(
        'SELECT id FROM products WHERE supplier_sku = $1',
        [supplierSKU]
      );

      let productId: string;

      if (existingProduct.rows.length > 0) {
        // Update existing product
        productId = existingProduct.rows[0].id;

        await client.query(
          `UPDATE products SET
            name = $1,
            manufacturer_code = $2,
            brand_id = $3,
            category_id = $4,
            price = $5,
            currency = $6,
            stock_quantity = $7,
            long_description = $8,
            short_description = $9,
            warranty = $10,
            product_class = $11,
            solution = $12,
            exchange_rate = $13,
            exchange_rate_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $14`,
          [
            name,
            manufacturerCode,
            brandId,
            categoryId,
            price,
            currency,
            stockAvailable,
            technicalSheet,
            commercialSheet,
            warranty,
            productClass,
            solution,
            exchangeRate,
            productId,
          ]
        );
      } else {
        // Create new product
        const insertResult = await client.query(
          `INSERT INTO products (
            supplier_sku, sku, name, slug, manufacturer_code,
            brand_id, category_id, price, currency, stock_quantity,
            long_description, short_description, warranty, product_class,
            solution, exchange_rate, exchange_rate_date
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP
          ) RETURNING id`,
          [
            supplierSKU,
            supplierSKU, // Use supplier SKU as main SKU
            name,
            slugify(name),
            manufacturerCode,
            brandId,
            categoryId,
            price,
            currency,
            stockAvailable,
            technicalSheet,
            commercialSheet,
            warranty,
            productClass,
            solution,
            exchangeRate,
          ]
        );

        productId = insertResult.rows[0].id;
      }

      // Process promotion data
      await this.processPromotion(client, productId, item);

      // Process warehouse locations
      await this.processWarehouseLocations(client, productId, item);
      result.warehouses_synced++;

      // Process image
      if (imageUrl && imageUrl !== 'Sin Descuento') {
        try {
          // Delete existing images for this product
          await client.query('DELETE FROM product_images WHERE product_id = $1', [
            productId,
          ]);

          // Import new image from URL
          const imageResult = await imageService.processImageFromUrl(imageUrl);

          await client.query(
            `INSERT INTO product_images (
              product_id, url, thumbnail_url, width, height, file_size, is_primary
            ) VALUES ($1, $2, $3, $4, $5, $6, true)`,
            [
              productId,
              imageResult.url,
              imageResult.thumbnail_url,
              imageResult.width,
              imageResult.height,
              imageResult.file_size,
            ]
          );
        } catch (imageError) {
          console.error('Error processing image:', imageError);
          // Continue even if image fails
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process promotion data
   */
  private async processPromotion(
    client: any,
    productId: string,
    item: any
  ): Promise<void> {
    const promoCode = this.extractValue(item.ClavePromocion);
    const promoDescription = this.extractValue(item.DescripcionPromocion);
    const discountAmount = this.extractValue(item.TotalDescuento);
    const discountPrice = this.extractValue(item.PrecioDescuento);
    const validUntil = this.extractValue(item.VencimientoPromocion);

    // Skip if no promotion
    if (
      !promoCode ||
      promoCode === 'Sin Descuento' ||
      !discountPrice ||
      discountPrice === 'Sin Descuento'
    ) {
      return;
    }

    // Delete existing promotions for this product
    await client.query('DELETE FROM product_promotions WHERE product_id = $1', [
      productId,
    ]);

    // Parse valid until date
    let validUntilDate = null;
    if (validUntil && validUntil !== 'Sin Descuento' && validUntil !== 'Por Cantidad') {
      try {
        // Parse date in format DD/MM/YYYY
        const parts = validUntil.split('/');
        if (parts.length === 3) {
          validUntilDate = new Date(
            parseInt(parts[2]),
            parseInt(parts[1]) - 1,
            parseInt(parts[0])
          );
        }
      } catch (e) {
        // Ignore date parsing errors
      }
    }

    // Insert new promotion
    await client.query(
      `INSERT INTO product_promotions (
        product_id, promotion_code, promotion_description,
        discount_amount, discounted_price, valid_until, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [
        productId,
        promoCode,
        promoDescription,
        parseFloat(discountAmount || '0'),
        parseFloat(discountPrice),
        validUntilDate,
      ]
    );
  }

  /**
   * Process warehouse location stock
   */
  private async processWarehouseLocations(
    client: any,
    productId: string,
    item: any
  ): Promise<void> {
    const locationMapping: { [key: string]: string } = {
      MEXICO_CENTRO_DE_DISTRIBUCION: 'MEXICO_CD',
      MONTERREY_CENTRO_DE_DISTRIBUCION: 'MONTERREY_CD',
      VENTAS_CANCUN: 'CANCUN',
      VENTAS_CHIHUAHUA: 'CHIHUAHUA',
      VENTAS_CULIACAN: 'CULIACAN',
      VENTAS_GUADALAJARA: 'GUADALAJARA',
      VENTAS_HERMOSILLO: 'HERMOSILLO',
      VENTAS_LEON: 'LEON',
      VENTAS_MERIDA: 'MERIDA',
      VENTAS_MONTERREY: 'MONTERREY',
      VENTAS_MORELIA: 'MORELIA',
      VENTAS_OAXACA: 'OAXACA',
      VENTAS_PACHUCA: 'PACHUCA',
      VENTAS_PUEBLA: 'PUEBLA',
      VENTAS_QUERETARO: 'QUERETARO',
      VENTAS_TEPIC: 'TEPIC',
      VENTAS_TOLUCA: 'TOLUCA',
      VENTAS_TORREON: 'TORREON',
      VENTAS_TUXTLA: 'TUXTLA',
      VENTAS_VERACRUZ: 'VERACRUZ',
      VENTAS_VILLAHERMOSA: 'VILLAHERMOSA',
    };

    // Delete existing stock locations
    await client.query('DELETE FROM product_stock_locations WHERE product_id = $1', [
      productId,
    ]);

    // Process each location
    for (const [xmlKey, warehouseCode] of Object.entries(locationMapping)) {
      const quantity = parseInt(this.extractValue(item[xmlKey]) || '0');

      if (quantity > 0) {
        // Get warehouse ID
        const warehouseResult = await client.query(
          'SELECT id FROM warehouse_locations WHERE code = $1',
          [warehouseCode]
        );

        if (warehouseResult.rows.length > 0) {
          const warehouseId = warehouseResult.rows[0].id;

          await client.query(
            `INSERT INTO product_stock_locations (product_id, warehouse_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, warehouse_id)
             DO UPDATE SET quantity = $3, updated_at = CURRENT_TIMESTAMP`,
            [productId, warehouseId, quantity]
          );
        }
      }
    }
  }

  /**
   * Get or create brand
   */
  private async getOrCreateBrand(
    client: any,
    brandName: string
  ): Promise<string | null> {
    if (!brandName) return null;

    const slug = slugify(brandName);

    // Check if brand exists
    const existingBrand = await client.query(
      'SELECT id FROM brands WHERE slug = $1',
      [slug]
    );

    if (existingBrand.rows.length > 0) {
      return existingBrand.rows[0].id;
    }

    // Create brand
    const result = await client.query(
      'INSERT INTO brands (name, slug) VALUES ($1, $2) RETURNING id',
      [brandName, slug]
    );

    return result.rows[0].id;
  }

  /**
   * Get or create category (with hierarchy)
   */
  private async getOrCreateCategory(
    client: any,
    groupName: string,
    subgroupName?: string
  ): Promise<string | null> {
    if (!groupName) return null;

    const groupSlug = slugify(groupName);

    // Check if parent category exists
    let parentId = null;
    const existingGroup = await client.query(
      'SELECT id FROM categories WHERE slug = $1 AND parent_id IS NULL',
      [groupSlug]
    );

    if (existingGroup.rows.length > 0) {
      parentId = existingGroup.rows[0].id;
    } else {
      // Create parent category
      const groupResult = await client.query(
        'INSERT INTO categories (name, slug, parent_id) VALUES ($1, $2, NULL) RETURNING id',
        [groupName, groupSlug]
      );
      parentId = groupResult.rows[0].id;
    }

    // If no subgroup, return parent
    if (!subgroupName) return parentId;

    // Handle subgroup
    const subgroupSlug = slugify(subgroupName);

    const existingSubgroup = await client.query(
      'SELECT id FROM categories WHERE slug = $1 AND parent_id = $2',
      [subgroupSlug, parentId]
    );

    if (existingSubgroup.rows.length > 0) {
      return existingSubgroup.rows[0].id;
    }

    // Create subgroup
    const subgroupResult = await client.query(
      'INSERT INTO categories (name, slug, parent_id) VALUES ($1, $2, $3) RETURNING id',
      [subgroupName, subgroupSlug, parentId]
    );

    return subgroupResult.rows[0].id;
  }

  /**
   * Map currency from Spanish to code
   */
  private mapCurrency(currency: string): string {
    if (!currency) return 'MXN';

    const normalized = currency.toLowerCase();
    if (normalized.includes('dolar') || normalized.includes('dollar')) {
      return 'USD';
    }
    if (normalized.includes('peso')) {
      return 'MXN';
    }

    return 'MXN'; // Default
  }

  /**
   * Extract value from XML node
   */
  private extractValue(node: any): string {
    if (!node) return '';
    if (Array.isArray(node)) return node[0] || '';
    return String(node);
  }
}

export default new XMLImportService();
