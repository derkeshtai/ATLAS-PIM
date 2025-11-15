import https from 'https';
import { parseString } from 'xml2js';
import { Pool } from 'pg';
import pool from '../config/database';
import imageService from './imageService';

interface IcecatApiConfig {
  username: string;
  password: string;
  language?: string;
}

interface IcecatProductData {
  icecat_id?: string;
  gtin?: string;
  model?: string;
  brand?: string;
  category?: string;
  title?: string;
  short_description?: string;
  long_description?: string;
  quality?: string;
  on_market?: boolean;
  product_views?: number;
  release_date?: string;
  warranty?: string;
  specifications?: Array<{
    group: string;
    key: string;
    value: string;
  }>;
  images?: string[];
  videos?: string[];
  pdfs?: string[];
  manuals?: string[];
}

interface IcecatSyncResult {
  success: boolean;
  product_id?: string;
  icecat_id?: string;
  gtin?: string;
  specifications_added?: number;
  multimedia_added?: number;
  error?: string;
}

export class IcecatApiService {
  private config: IcecatApiConfig;
  private readonly baseUrl = 'https://live.icecat.biz/api';

  constructor() {
    this.config = {
      username: process.env.ICECAT_USERNAME || '',
      password: process.env.ICECAT_PASSWORD || '',
      language: process.env.ICECAT_LANGUAGE || 'en'
    };
  }

  /**
   * Fetch product data from Icecat API by GTIN
   */
  async fetchProductByGTIN(gtin: string): Promise<IcecatProductData> {
    if (!this.config.username || !this.config.password) {
      throw new Error('Icecat API credentials not configured. Set ICECAT_USERNAME and ICECAT_PASSWORD in .env');
    }

    const url = `${this.baseUrl}/?UserName=${this.config.username}&Language=${this.config.language}&GTIN=${gtin}`;

    try {
      const xmlData = await this.makeHttpsRequest(url);
      return await this.parseIcecatXML(xmlData);
    } catch (error) {
      console.error(`Error fetching product from Icecat API (GTIN: ${gtin}):`, error);
      throw new Error(`Failed to fetch product from Icecat: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch product data from Icecat API by Icecat Product ID
   */
  async fetchProductByIcecatId(icecatId: string): Promise<IcecatProductData> {
    if (!this.config.username || !this.config.password) {
      throw new Error('Icecat API credentials not configured');
    }

    const url = `${this.baseUrl}/?UserName=${this.config.username}&Language=${this.config.language}&prodID=${icecatId}`;

    try {
      const xmlData = await this.makeHttpsRequest(url);
      return await this.parseIcecatXML(xmlData);
    } catch (error) {
      console.error(`Error fetching product from Icecat API (ID: ${icecatId}):`, error);
      throw error;
    }
  }

  /**
   * Sync product with Icecat data and save to database
   */
  async syncProductByGTIN(gtin: string, userId: string): Promise<IcecatSyncResult> {
    const result: IcecatSyncResult = {
      success: false,
      gtin
    };

    try {
      // Fetch from Icecat
      const icecatData = await this.fetchProductByGTIN(gtin);
      result.icecat_id = icecatData.icecat_id;

      // Save to database
      const productId = await this.saveIcecatProductToDatabase(icecatData, userId);
      result.product_id = productId;
      result.success = true;

      // Count added data
      result.specifications_added = icecatData.specifications?.length || 0;
      result.multimedia_added = (icecatData.images?.length || 0) +
                                (icecatData.videos?.length || 0) +
                                (icecatData.pdfs?.length || 0);

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    }
  }

  /**
   * Sync multiple products by GTIN list
   */
  async syncProductsByGTINList(gtins: string[], userId: string): Promise<IcecatSyncResult[]> {
    const results: IcecatSyncResult[] = [];

    for (const gtin of gtins) {
      try {
        const result = await this.syncProductByGTIN(gtin, userId);
        results.push(result);

        // Rate limiting - wait 500ms between requests
        await this.sleep(500);
      } catch (error) {
        results.push({
          success: false,
          gtin,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Update existing product with Icecat data
   */
  async updateProductWithIcecatData(productId: string): Promise<IcecatSyncResult> {
    const result: IcecatSyncResult = {
      success: false,
      product_id: productId
    };

    const client = await pool.connect();

    try {
      // Get product GTIN or Icecat ID
      const productQuery = await client.query(
        'SELECT gtin_ean_upc, icecat_id FROM products WHERE id = $1',
        [productId]
      );

      if (productQuery.rows.length === 0) {
        throw new Error('Product not found');
      }

      const { gtin_ean_upc, icecat_id } = productQuery.rows[0];

      if (!gtin_ean_upc && !icecat_id) {
        throw new Error('Product has no GTIN or Icecat ID');
      }

      // Fetch from Icecat
      const icecatData = gtin_ean_upc
        ? await this.fetchProductByGTIN(gtin_ean_upc)
        : await this.fetchProductByIcecatId(icecat_id);

      result.icecat_id = icecatData.icecat_id;
      result.gtin = icecatData.gtin;

      // Update in database
      await this.updateProductInDatabase(client, productId, icecatData);

      result.success = true;
      result.specifications_added = icecatData.specifications?.length || 0;
      result.multimedia_added = (icecatData.images?.length || 0) +
                                (icecatData.videos?.length || 0) +
                                (icecatData.pdfs?.length || 0);

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Make HTTPS request to Icecat API
   */
  private makeHttpsRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');

      const options = {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/xml'
        }
      };

      https.get(url, options, (res) => {
        let data = '';

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });

        res.on('error', (error) => {
          reject(error);
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse Icecat XML response
   */
  private parseIcecatXML(xmlData: string): Promise<IcecatProductData> {
    return new Promise((resolve, reject) => {
      parseString(xmlData, { explicitArray: false }, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const product = result.ICECAT?.Product;

          if (!product) {
            reject(new Error('Invalid Icecat XML response'));
            return;
          }

          // Extract basic data
          const productData: IcecatProductData = {
            icecat_id: product.$?.ID || product.$?.Prod_id,
            gtin: product.$?.EAN_UPC || product.$?.GTIN,
            model: product.$?.Code || product.$?.Model,
            brand: product.Supplier?.$?.Name || product.$?.Brand,
            category: product.Category?.$?.Name,
            title: product.$?.Title || product.$?.Name,
            short_description: product.SummaryDescription?.$?.ShortSummaryDescription,
            long_description: product.SummaryDescription?.$?.LongSummaryDescription ||
                            product.ProductDescription?.$?.LongProductDescription,
            quality: product.$?.Quality,
            on_market: product.$?.OnMarket === 'true' || product.$?.OnMarket === '1',
            product_views: parseInt(product.$?.ProductViews || '0', 10),
            release_date: product.$?.ReleaseDate,
            warranty: product.$?.Warranty,
            specifications: [],
            images: [],
            videos: [],
            pdfs: [],
            manuals: []
          };

          // Extract specifications
          const features = product.ProductFeature;
          if (features) {
            const featureArray = Array.isArray(features) ? features : [features];

            productData.specifications = featureArray.map((feature: any) => ({
              group: feature.Feature?.CategoryFeatureGroup?.$?.Name || 'General',
              key: feature.Feature?.$?.Name || feature.$?.Name,
              value: feature.$?.Value || feature.$?.Presentation_Value || ''
            }));
          }

          // Extract images
          const gallery = product.Gallery?.Pic;
          if (gallery) {
            const picArray = Array.isArray(gallery) ? gallery : [gallery];
            productData.images = picArray
              .map((pic: any) => pic.$?.Pic || pic.$?.HighPic)
              .filter((url: string) => url);
          }

          // Extract videos
          if (product.Multimedia?.Video) {
            const videos = Array.isArray(product.Multimedia.Video)
              ? product.Multimedia.Video
              : [product.Multimedia.Video];
            productData.videos = videos
              .map((video: any) => video.$?.URL || video)
              .filter((url: string) => url);
          }

          // Extract PDFs
          if (product.Multimedia?.PDF) {
            const pdfs = Array.isArray(product.Multimedia.PDF)
              ? product.Multimedia.PDF
              : [product.Multimedia.PDF];
            productData.pdfs = pdfs
              .map((pdf: any) => pdf.$?.URL || pdf)
              .filter((url: string) => url);
          }

          // Extract manuals
          if (product.Multimedia?.Manual) {
            const manuals = Array.isArray(product.Multimedia.Manual)
              ? product.Multimedia.Manual
              : [product.Multimedia.Manual];
            productData.manuals = manuals
              .map((manual: any) => manual.$?.URL || manual)
              .filter((url: string) => url);
          }

          resolve(productData);
        } catch (parseError) {
          reject(new Error(`Error parsing Icecat XML: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
        }
      });
    });
  }

  /**
   * Save Icecat product to database
   */
  private async saveIcecatProductToDatabase(data: IcecatProductData, userId: string): Promise<string> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if product exists
      let productId = await this.findExistingProduct(client, data.icecat_id, data.gtin);

      if (productId) {
        // Update existing
        await this.updateProductInDatabase(client, productId, data);
      } else {
        // Create new
        productId = await this.createProductInDatabase(client, data);
      }

      await client.query('COMMIT');
      return productId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find existing product by Icecat ID or GTIN
   */
  private async findExistingProduct(client: Pool, icecatId?: string, gtin?: string): Promise<string | null> {
    if (icecatId) {
      const result = await client.query(
        'SELECT id FROM products WHERE icecat_id = $1 LIMIT 1',
        [icecatId]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }

    if (gtin) {
      const result = await client.query(
        'SELECT id FROM products WHERE gtin_ean_upc = $1 LIMIT 1',
        [gtin]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }

    return null;
  }

  /**
   * Create product in database
   */
  private async createProductInDatabase(client: Pool, data: IcecatProductData): Promise<string> {
    // Get or create brand
    let brandId = null;
    if (data.brand) {
      brandId = await this.getOrCreateBrand(client, data.brand);
    }

    // Get or create category
    let categoryId = null;
    if (data.category) {
      categoryId = await this.getOrCreateCategory(client, data.category);
    }

    const query = `
      INSERT INTO products (
        sku,
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
      RETURNING id
    `;

    const sku = data.gtin || data.icecat_id || this.generateSKU();
    const slug = this.generateSlug(data.title || data.model || sku);

    const result = await client.query(query, [
      sku,
      data.title || data.model || 'Untitled Product',
      slug,
      data.short_description,
      data.long_description,
      categoryId,
      brandId,
      data.icecat_id,
      data.gtin,
      data.model,
      data.quality,
      data.on_market,
      data.warranty
    ]);

    const productId = result.rows[0].id;

    // Create Icecat mapping
    await this.createIcecatMapping(client, productId, data);

    // Save specifications
    if (data.specifications && data.specifications.length > 0) {
      await this.saveSpecifications(client, productId, data.specifications);
    }

    // Save multimedia
    await this.saveMultimedia(client, productId, data);

    return productId;
  }

  /**
   * Update product in database
   */
  private async updateProductInDatabase(client: Pool, productId: string, data: IcecatProductData): Promise<void> {
    // Get or create brand
    let brandId = null;
    if (data.brand) {
      brandId = await this.getOrCreateBrand(client, data.brand);
    }

    // Get or create category
    let categoryId = null;
    if (data.category) {
      categoryId = await this.getOrCreateCategory(client, data.category);
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

    await client.query(query, [
      data.title,
      data.short_description,
      data.long_description,
      categoryId,
      brandId,
      data.icecat_id,
      data.gtin,
      data.model,
      data.quality,
      data.on_market,
      data.warranty,
      productId
    ]);

    // Update Icecat mapping
    await this.updateIcecatMapping(client, productId, data);

    // Update specifications
    if (data.specifications && data.specifications.length > 0) {
      await this.saveSpecifications(client, productId, data.specifications);
    }

    // Update multimedia
    await this.saveMultimedia(client, productId, data);
  }

  /**
   * Create Icecat mapping
   */
  private async createIcecatMapping(client: Pool, productId: string, data: IcecatProductData): Promise<void> {
    const query = `
      INSERT INTO icecat_product_mapping (
        product_id,
        icecat_id,
        gtin_ean_upc,
        quality,
        on_market,
        product_views,
        last_synced
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id) DO UPDATE SET
        icecat_id = $2,
        gtin_ean_upc = $3,
        quality = $4,
        on_market = $5,
        product_views = $6,
        last_synced = CURRENT_TIMESTAMP
    `;

    await client.query(query, [
      productId,
      data.icecat_id,
      data.gtin,
      data.quality,
      data.on_market,
      data.product_views || 0
    ]);
  }

  /**
   * Update Icecat mapping
   */
  private async updateIcecatMapping(client: Pool, productId: string, data: IcecatProductData): Promise<void> {
    await this.createIcecatMapping(client, productId, data);
  }

  /**
   * Save specifications
   */
  private async saveSpecifications(
    client: Pool,
    productId: string,
    specifications: Array<{ group: string; key: string; value: string }>
  ): Promise<void> {
    // Delete existing
    await client.query('DELETE FROM product_specifications WHERE product_id = $1', [productId]);

    // Insert new
    for (let i = 0; i < specifications.length; i++) {
      const spec = specifications[i];
      const query = `
        INSERT INTO product_specifications (
          product_id,
          spec_key,
          spec_value,
          spec_group,
          spec_order
        ) VALUES ($1, $2, $3, $4, $5)
      `;

      await client.query(query, [
        productId,
        spec.key,
        spec.value,
        spec.group,
        i
      ]);
    }
  }

  /**
   * Save multimedia
   */
  private async saveMultimedia(client: Pool, productId: string, data: IcecatProductData): Promise<void> {
    // Delete existing
    await client.query('DELETE FROM product_multimedia WHERE product_id = $1', [productId]);

    let position = 0;

    // Save images
    if (data.images) {
      for (let i = 0; i < data.images.length; i++) {
        await this.addMultimedia(client, productId, 'image', data.images[i], i === 0, position++);
      }
    }

    // Save videos
    if (data.videos) {
      for (const video of data.videos) {
        await this.addMultimedia(client, productId, 'video', video, false, position++);
      }
    }

    // Save PDFs
    if (data.pdfs) {
      for (const pdf of data.pdfs) {
        await this.addMultimedia(client, productId, 'pdf', pdf, false, position++);
      }
    }

    // Save manuals
    if (data.manuals) {
      for (const manual of data.manuals) {
        await this.addMultimedia(client, productId, 'manual', manual, false, position++);
      }
    }
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

    // If it's an image and primary, also add to product_images
    if (mediaType === 'image' && isPrimary) {
      try {
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
      }
    }
  }

  /**
   * Get or create category
   */
  private async getOrCreateCategory(client: Pool, categoryName: string): Promise<string> {
    const slug = this.generateSlug(categoryName);

    let result = await client.query(
      'SELECT id FROM categories WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

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

    let result = await client.query(
      'SELECT id FROM brands WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    result = await client.query(
      `INSERT INTO brands (name, slug, is_active)
       VALUES ($1, $2, true)
       RETURNING id`,
      [brandName, slug]
    );

    return result.rows[0].id;
  }

  // Helper methods
  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private generateSKU(): string {
    return `ICECAT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new IcecatApiService();
