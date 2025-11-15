import * as XLSX from 'xlsx';
import { Pool } from 'pg';
import pool from '../config/database';
import imageService from './imageService';

interface IcecatExcelRow {
  Requested_prod_id?: string;
  Icecat_id?: string;
  Supplier?: string;
  GTIN?: string;
  Model?: string;
  ProductTitle?: string;
  ShortDesc?: string;
  LongDesc?: string;
  Category?: string;
  Quality?: string;
  OnMarket?: string;
  ProductViews?: string;
  ReleaseDate?: string;
  EndOfLifeDate?: string;
  CountryMarket?: string;
  Warranty?: string;
  ProductGallery?: string;
  HighPic?: string;
  LowPic?: string;
  ThumbPic?: string;
  Video?: string;
  PDF?: string;
  Manual?: string;
  Pdf360?: string;
  Video360?: string;
  [key: string]: any; // For hundreds of dynamic specification fields
}

interface IcecatImportResult {
  total_items: number;
  successful_items: number;
  failed_items: number;
  specifications_added: number;
  multimedia_added: number;
  errors: Array<{
    row: number;
    icecat_id?: string;
    error: string;
    data?: any;
  }>;
}

interface IcecatSpecification {
  spec_key: string;
  spec_value: string;
  spec_group: string;
  spec_order: number;
}

export class IcecatExcelService {
  private readonly coreFields = [
    'Requested_prod_id',
    'Icecat_id',
    'Supplier',
    'GTIN',
    'Model',
    'ProductTitle',
    'ShortDesc',
    'LongDesc',
    'Category',
    'Quality',
    'OnMarket',
    'ProductViews',
    'ReleaseDate',
    'EndOfLifeDate',
    'CountryMarket',
    'Warranty',
    'ProductGallery',
    'HighPic',
    'LowPic',
    'ThumbPic',
    'Video',
    'PDF',
    'Manual',
    'Pdf360',
    'Video360'
  ];

  private readonly multimediaFields = [
    'ProductGallery',
    'HighPic',
    'LowPic',
    'ThumbPic',
    'Video',
    'PDF',
    'Manual',
    'Pdf360',
    'Video360'
  ];

  /**
   * Import products from Icecat Excel file
   */
  async importFromIcecatExcel(excelBuffer: Buffer, userId: string): Promise<IcecatImportResult> {
    const result: IcecatImportResult = {
      total_items: 0,
      successful_items: 0,
      failed_items: 0,
      specifications_added: 0,
      multimedia_added: 0,
      errors: []
    };

    try {
      // Parse Excel file
      const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const rows: IcecatExcelRow[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      if (!rows || rows.length === 0) {
        throw new Error('Excel file is empty or invalid');
      }

      result.total_items = rows.length;

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        try {
          await this.processIcecatRow(rows[i], i, result);
          result.successful_items++;
        } catch (error) {
          result.failed_items++;
          result.errors.push({
            row: i + 2, // +2 because Excel starts at 1 and header is row 1
            icecat_id: rows[i].Icecat_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: rows[i]
          });
          console.error(`Error processing Icecat row ${i + 2}:`, error);
        }
      }

      // Create import history record
      await this.createImportHistory(userId, result);

      return result;
    } catch (error) {
      console.error('Error importing Icecat Excel:', error);
      throw error;
    }
  }

  /**
   * Process a single Icecat Excel row
   */
  private async processIcecatRow(
    row: IcecatExcelRow,
    rowIndex: number,
    result: IcecatImportResult
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Extract core data
      const icecatId = this.cleanValue(row.Icecat_id);
      const gtin = this.cleanValue(row.GTIN);
      const requestedProdId = this.cleanValue(row.Requested_prod_id);

      if (!icecatId && !gtin && !requestedProdId) {
        throw new Error('Missing required identifiers (Icecat_id, GTIN, or Requested_prod_id)');
      }

      // Try to find existing product by GTIN, Icecat ID, or supplier SKU
      let productId = await this.findExistingProduct(client, icecatId, gtin, requestedProdId);

      if (productId) {
        // Update existing product
        await this.updateProductWithIcecatData(client, productId, row);
      } else {
        // Create new product
        productId = await this.createProductFromIcecatData(client, row);
      }

      // Create or update Icecat mapping
      await this.upsertIcecatMapping(client, productId, row);

      // Process specifications (hundreds of dynamic columns)
      const specifications = this.extractSpecifications(row);
      if (specifications.length > 0) {
        await this.saveSpecifications(client, productId, specifications);
        result.specifications_added += specifications.length;
      }

      // Process multimedia (images, videos, PDFs)
      const multimediaCount = await this.processMultimedia(client, productId, row);
      result.multimedia_added += multimediaCount;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find existing product by Icecat ID, GTIN, or supplier SKU
   */
  private async findExistingProduct(
    client: Pool,
    icecatId?: string,
    gtin?: string,
    requestedProdId?: string
  ): Promise<string | null> {
    // Try by Icecat ID first
    if (icecatId) {
      const result = await client.query(
        'SELECT id FROM products WHERE icecat_id = $1 LIMIT 1',
        [icecatId]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }

    // Try by GTIN
    if (gtin) {
      const result = await client.query(
        'SELECT id FROM products WHERE gtin_ean_upc = $1 LIMIT 1',
        [gtin]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }

    // Try by supplier SKU (requested_prod_id)
    if (requestedProdId) {
      const result = await client.query(
        'SELECT id FROM products WHERE supplier_sku = $1 LIMIT 1',
        [requestedProdId]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }

    // Try by Icecat mapping table
    if (icecatId) {
      const result = await client.query(
        'SELECT product_id FROM icecat_product_mapping WHERE icecat_id = $1 LIMIT 1',
        [icecatId]
      );
      if (result.rows.length > 0) return result.rows[0].product_id;
    }

    return null;
  }

  /**
   * Create new product from Icecat data
   */
  private async createProductFromIcecatData(client: Pool, row: IcecatExcelRow): Promise<string> {
    const productTitle = this.cleanValue(row.ProductTitle) || 'Untitled Product';
    const slug = this.generateSlug(productTitle);
    const category = this.cleanValue(row.Category);

    // Get or create category
    let categoryId = null;
    if (category) {
      categoryId = await this.getOrCreateCategory(client, category);
    }

    // Get or create brand
    let brandId = null;
    const supplier = this.cleanValue(row.Supplier);
    if (supplier) {
      brandId = await this.getOrCreateBrand(client, supplier);
    }

    const query = `
      INSERT INTO products (
        sku,
        supplier_sku,
        name,
        slug,
        short_description,
        long_description,
        category_id,
        brand_id,
        icecat_id,
        gtin_ean_upc,
        model_name,
        quality_rating,
        on_market,
        warranty,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
      RETURNING id
    `;

    const values = [
      this.cleanValue(row.GTIN) || this.cleanValue(row.Icecat_id) || this.generateSKU(),
      this.cleanValue(row.Requested_prod_id),
      productTitle,
      slug,
      this.cleanValue(row.ShortDesc),
      this.cleanValue(row.LongDesc),
      categoryId,
      brandId,
      this.cleanValue(row.Icecat_id),
      this.cleanValue(row.GTIN),
      this.cleanValue(row.Model),
      this.cleanValue(row.Quality),
      this.parseBoolean(row.OnMarket, true),
      this.cleanValue(row.Warranty)
    ];

    const result = await client.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Update existing product with Icecat data
   */
  private async updateProductWithIcecatData(
    client: Pool,
    productId: string,
    row: IcecatExcelRow
  ): Promise<void> {
    const productTitle = this.cleanValue(row.ProductTitle);
    const category = this.cleanValue(row.Category);

    // Get or create category
    let categoryId = null;
    if (category) {
      categoryId = await this.getOrCreateCategory(client, category);
    }

    // Get or create brand
    let brandId = null;
    const supplier = this.cleanValue(row.Supplier);
    if (supplier) {
      brandId = await this.getOrCreateBrand(client, supplier);
    }

    const query = `
      UPDATE products SET
        name = COALESCE($1, name),
        short_description = COALESCE($2, short_description),
        long_description = COALESCE($3, long_description),
        category_id = COALESCE($4, category_id),
        brand_id = COALESCE($5, brand_id),
        icecat_id = COALESCE($6, icecat_id),
        gtin_ean_upc = COALESCE($7, gtin_ean_upc),
        model_name = COALESCE($8, model_name),
        quality_rating = COALESCE($9, quality_rating),
        on_market = COALESCE($10, on_market),
        warranty = COALESCE($11, warranty),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
    `;

    const values = [
      productTitle,
      this.cleanValue(row.ShortDesc),
      this.cleanValue(row.LongDesc),
      categoryId,
      brandId,
      this.cleanValue(row.Icecat_id),
      this.cleanValue(row.GTIN),
      this.cleanValue(row.Model),
      this.cleanValue(row.Quality),
      this.parseBoolean(row.OnMarket, true),
      this.cleanValue(row.Warranty),
      productId
    ];

    await client.query(query, values);
  }

  /**
   * Create or update Icecat product mapping
   */
  private async upsertIcecatMapping(client: Pool, productId: string, row: IcecatExcelRow): Promise<void> {
    const query = `
      INSERT INTO icecat_product_mapping (
        product_id,
        icecat_id,
        gtin_ean_upc,
        requested_prod_id,
        supplier_icecat,
        quality,
        on_market,
        product_views,
        last_synced
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id) DO UPDATE SET
        icecat_id = COALESCE($2, icecat_product_mapping.icecat_id),
        gtin_ean_upc = COALESCE($3, icecat_product_mapping.gtin_ean_upc),
        requested_prod_id = COALESCE($4, icecat_product_mapping.requested_prod_id),
        supplier_icecat = COALESCE($5, icecat_product_mapping.supplier_icecat),
        quality = COALESCE($6, icecat_product_mapping.quality),
        on_market = COALESCE($7, icecat_product_mapping.on_market),
        product_views = COALESCE($8, icecat_product_mapping.product_views),
        last_synced = CURRENT_TIMESTAMP
    `;

    const values = [
      productId,
      this.cleanValue(row.Icecat_id),
      this.cleanValue(row.GTIN),
      this.cleanValue(row.Requested_prod_id),
      this.cleanValue(row.Supplier),
      this.cleanValue(row.Quality),
      this.parseBoolean(row.OnMarket, true),
      this.parseInteger(row.ProductViews, 0)
    ];

    await client.query(query, values);
  }

  /**
   * Extract specifications from dynamic columns
   * Columns are in format "Category::Specification Name"
   */
  private extractSpecifications(row: IcecatExcelRow): IcecatSpecification[] {
    const specifications: IcecatSpecification[] = [];
    let order = 0;

    for (const [key, value] of Object.entries(row)) {
      // Skip core fields
      if (this.coreFields.includes(key)) continue;

      // Skip null/empty values
      if (value === null || value === undefined || value === '') continue;

      // Parse specification format "Category::Specification Name"
      let specGroup = 'General';
      let specKey = key;

      if (key.includes('::')) {
        const parts = key.split('::');
        specGroup = parts[0].trim();
        specKey = parts.slice(1).join('::').trim();
      }

      specifications.push({
        spec_key: specKey,
        spec_value: String(value),
        spec_group: specGroup,
        spec_order: order++
      });
    }

    return specifications;
  }

  /**
   * Save specifications to database
   */
  private async saveSpecifications(
    client: Pool,
    productId: string,
    specifications: IcecatSpecification[]
  ): Promise<void> {
    // Delete existing specifications for this product
    await client.query('DELETE FROM product_specifications WHERE product_id = $1', [productId]);

    // Insert new specifications
    for (const spec of specifications) {
      const query = `
        INSERT INTO product_specifications (
          product_id,
          spec_key,
          spec_value,
          spec_group,
          spec_order
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (product_id, spec_key) DO UPDATE SET
          spec_value = $3,
          spec_group = $4,
          spec_order = $5
      `;

      await client.query(query, [
        productId,
        spec.spec_key,
        spec.spec_value,
        spec.spec_group,
        spec.spec_order
      ]);
    }
  }

  /**
   * Process multimedia (images, videos, PDFs, manuals)
   */
  private async processMultimedia(client: Pool, productId: string, row: IcecatExcelRow): Promise<number> {
    let count = 0;

    // Delete existing multimedia for this product
    await client.query('DELETE FROM product_multimedia WHERE product_id = $1', [productId]);

    // Process ProductGallery (multiple images separated by |)
    const gallery = this.cleanValue(row.ProductGallery);
    if (gallery) {
      const imageUrls = gallery.split('|').filter(url => url.trim());
      for (let i = 0; i < imageUrls.length; i++) {
        await this.addMultimedia(client, productId, 'image', imageUrls[i].trim(), i === 0, i);
        count++;
      }
    }

    // Process individual image types
    const imageFields = [
      { field: 'HighPic', type: 'image_high' },
      { field: 'LowPic', type: 'image_low' },
      { field: 'ThumbPic', type: 'image_thumb' }
    ];

    for (const { field, type } of imageFields) {
      const url = this.cleanValue(row[field as keyof IcecatExcelRow]);
      if (url) {
        await this.addMultimedia(client, productId, type, url, false, count);
        count++;
      }
    }

    // Process videos
    const video = this.cleanValue(row.Video);
    if (video) {
      await this.addMultimedia(client, productId, 'video', video, false, count);
      count++;
    }

    const video360 = this.cleanValue(row.Video360);
    if (video360) {
      await this.addMultimedia(client, productId, 'video_360', video360, false, count);
      count++;
    }

    // Process documents
    const pdf = this.cleanValue(row.PDF);
    if (pdf) {
      await this.addMultimedia(client, productId, 'pdf', pdf, false, count);
      count++;
    }

    const manual = this.cleanValue(row.Manual);
    if (manual) {
      await this.addMultimedia(client, productId, 'manual', manual, false, count);
      count++;
    }

    const pdf360 = this.cleanValue(row.Pdf360);
    if (pdf360) {
      await this.addMultimedia(client, productId, 'pdf_360', pdf360, false, count);
      count++;
    }

    return count;
  }

  /**
   * Add multimedia record
   */
  private async addMultimedia(
    client: Pool,
    productId: string,
    mediaType: string,
    url: string,
    isPrimary: boolean,
    position: number
  ): Promise<void> {
    const query = `
      INSERT INTO product_multimedia (
        product_id,
        media_type,
        url,
        is_primary,
        position
      ) VALUES ($1, $2, $3, $4, $5)
    `;

    await client.query(query, [productId, mediaType, url, isPrimary, position]);

    // If it's an image and primary, also add to product_images for compatibility
    if (mediaType.startsWith('image') && isPrimary) {
      try {
        // Try to download and process the image
        const imageResult = await imageService.processImageFromUrl(url);

        const imageQuery = `
          INSERT INTO product_images (
            product_id,
            url,
            thumbnail_url,
            alt_text,
            is_primary,
            width,
            height,
            file_size,
            display_order
          ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, 0)
        `;

        await client.query(imageQuery, [
          productId,
          imageResult.url,
          imageResult.thumbnailUrl,
          'Product image from Icecat',
          imageResult.width,
          imageResult.height,
          imageResult.fileSize
        ]);
      } catch (error) {
        console.warn(`Could not process image from URL: ${url}`, error);
        // Continue without image - multimedia record is already saved
      }
    }
  }

  /**
   * Get or create category
   */
  private async getOrCreateCategory(client: Pool, categoryName: string): Promise<string> {
    const slug = this.generateSlug(categoryName);

    // Try to find existing
    let result = await client.query(
      'SELECT id FROM categories WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    // Create new
    result = await client.query(
      `INSERT INTO categories (name, slug, is_active)
       VALUES ($1, $2, true)
       RETURNING id`,
      [categoryName, slug]
    );

    return result.rows[0].id;
  }

  /**
   * Get or create brand
   */
  private async getOrCreateBrand(client: Pool, brandName: string): Promise<string> {
    const slug = this.generateSlug(brandName);

    // Try to find existing
    let result = await client.query(
      'SELECT id FROM brands WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    // Create new
    result = await client.query(
      `INSERT INTO brands (name, slug, is_active)
       VALUES ($1, $2, true)
       RETURNING id`,
      [brandName, slug]
    );

    return result.rows[0].id;
  }

  /**
   * Create import history record
   */
  private async createImportHistory(userId: string, result: IcecatImportResult): Promise<void> {
    const query = `
      INSERT INTO import_history (
        user_id,
        import_type,
        file_name,
        total_records,
        successful_records,
        failed_records,
        error_log,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await pool.query(query, [
      userId,
      'icecat_excel',
      'icecat_import.xlsx',
      result.total_items,
      result.successful_items,
      result.failed_items,
      JSON.stringify(result.errors),
      result.failed_items === 0 ? 'completed' : 'completed_with_errors'
    ]);
  }

  // Helper methods
  private cleanValue(value: any): string | null {
    if (value === null || value === undefined || value === '') return null;
    return String(value).trim();
  }

  private parseBoolean(value: any, defaultValue: boolean): boolean {
    if (value === null || value === undefined || value === '') return defaultValue;
    const str = String(value).toLowerCase().trim();
    return str === 'true' || str === '1' || str === 'yes' || str === 'y';
  }

  private parseInteger(value: any, defaultValue: number): number {
    if (value === null || value === undefined || value === '') return defaultValue;
    const num = parseInt(String(value), 10);
    return isNaN(num) ? defaultValue : num;
  }

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private generateSKU(): string {
    return `ICECAT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
}

export default new IcecatExcelService();
