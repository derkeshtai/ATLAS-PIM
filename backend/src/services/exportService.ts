import pool from '../config/database';
import productService from './productService';

export interface PrestashopProduct {
  id_product?: number;
  reference: string;
  name: string;
  description_short: string;
  description: string;
  price: number;
  wholesale_price: number;
  on_sale: number;
  quantity: number;
  active: number;
  category: string;
  manufacturer: string;
  images: string[];
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  weight: number;
  width: number;
  height: number;
  depth: number;
}

export class ExportService {
  /**
   * Export products to Prestashop format (JSON)
   */
  async exportToPrestashop(filters?: any): Promise<PrestashopProduct[]> {
    // Get all active products
    const result = await productService.getAllProducts(1, 10000, {
      ...filters,
      is_active: true,
    });

    const products: PrestashopProduct[] = [];

    for (const product of result.data) {
      // Get full product details with images
      const productDetails = await productService.getProductById(product.id);

      if (!productDetails) continue;

      // Map to Prestashop format
      const prestashopProduct: PrestashopProduct = {
        reference: productDetails.sku,
        name: productDetails.name,
        description_short: productDetails.short_description || '',
        description: productDetails.long_description || '',
        price: productDetails.sale_price || productDetails.price || 0,
        wholesale_price: productDetails.cost_price || 0,
        on_sale: productDetails.sale_price ? 1 : 0,
        quantity: productDetails.stock_quantity || 0,
        active: productDetails.is_active ? 1 : 0,
        category: productDetails.category_name || '',
        manufacturer: productDetails.brand_name || '',
        images: (productDetails.images || []).map((img) => img.url),
        meta_title: productDetails.meta_title || productDetails.name,
        meta_description: productDetails.meta_description || '',
        meta_keywords: productDetails.meta_keywords || '',
        weight: productDetails.weight || 0,
        width: productDetails.width || 0,
        height: productDetails.height || 0,
        depth: productDetails.depth || 0,
      };

      products.push(prestashopProduct);
    }

    return products;
  }

  /**
   * Export products to CSV format for Prestashop
   */
  async exportToCSV(filters?: any): Promise<string> {
    const products = await this.exportToPrestashop(filters);

    // CSV headers
    const headers = [
      'ID',
      'Reference',
      'Name',
      'Short Description',
      'Description',
      'Price',
      'Wholesale Price',
      'On Sale',
      'Quantity',
      'Active',
      'Category',
      'Manufacturer',
      'Images',
      'Meta Title',
      'Meta Description',
      'Meta Keywords',
      'Weight',
      'Width',
      'Height',
      'Depth',
    ];

    // Build CSV
    const rows = products.map((p) => [
      p.id_product || '',
      p.reference,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.description_short.replace(/"/g, '""')}"`,
      `"${p.description.replace(/"/g, '""')}"`,
      p.price,
      p.wholesale_price,
      p.on_sale,
      p.quantity,
      p.active,
      `"${p.category}"`,
      `"${p.manufacturer}"`,
      `"${p.images.join(';')}"`,
      `"${p.meta_title.replace(/"/g, '""')}"`,
      `"${p.meta_description.replace(/"/g, '""')}"`,
      `"${p.meta_keywords.replace(/"/g, '""')}"`,
      p.weight,
      p.width,
      p.height,
      p.depth,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return csv;
  }

  /**
   * Get single product in Prestashop format
   */
  async getProductForPrestashop(productId: string): Promise<PrestashopProduct | null> {
    const product = await productService.getProductById(productId);

    if (!product) {
      return null;
    }

    return {
      reference: product.sku,
      name: product.name,
      description_short: product.short_description || '',
      description: product.long_description || '',
      price: product.sale_price || product.price || 0,
      wholesale_price: product.cost_price || 0,
      on_sale: product.sale_price ? 1 : 0,
      quantity: product.stock_quantity || 0,
      active: product.is_active ? 1 : 0,
      category: product.category_name || '',
      manufacturer: product.brand_name || '',
      images: (product.images || []).map((img) => img.url),
      meta_title: product.meta_title || product.name,
      meta_description: product.meta_description || '',
      meta_keywords: product.meta_keywords || '',
      weight: product.weight || 0,
      width: product.width || 0,
      height: product.height || 0,
      depth: product.depth || 0,
    };
  }

  /**
   * Sync product with Prestashop API
   * This would integrate with Prestashop's WebService API
   */
  async syncWithPrestashop(productId: string): Promise<any> {
    const prestashopApiUrl = process.env.PRESTASHOP_API_URL;
    const prestashopApiKey = process.env.PRESTASHOP_API_KEY;

    if (!prestashopApiUrl || !prestashopApiKey) {
      throw new Error('Prestashop API credentials not configured');
    }

    const product = await this.getProductForPrestashop(productId);

    if (!product) {
      throw new Error('Product not found');
    }

    // Build XML for Prestashop API
    const xml = this.buildPrestashopXML(product);

    // Send to Prestashop API
    try {
      const response = await fetch(`${prestashopApiUrl}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(prestashopApiKey + ':').toString('base64')}`,
          'Content-Type': 'application/xml',
        },
        body: xml,
      });

      if (!response.ok) {
        throw new Error(`Prestashop API error: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Error syncing with Prestashop:', error);
      throw error;
    }
  }

  /**
   * Build XML for Prestashop WebService API
   */
  private buildPrestashopXML(product: PrestashopProduct): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <product>
    <reference>${this.escapeXml(product.reference)}</reference>
    <name>
      <language id="1">${this.escapeXml(product.name)}</language>
    </name>
    <description_short>
      <language id="1">${this.escapeXml(product.description_short)}</language>
    </description_short>
    <description>
      <language id="1">${this.escapeXml(product.description)}</language>
    </description>
    <price>${product.price}</price>
    <wholesale_price>${product.wholesale_price}</wholesale_price>
    <on_sale>${product.on_sale}</on_sale>
    <quantity>${product.quantity}</quantity>
    <active>${product.active}</active>
    <meta_title>
      <language id="1">${this.escapeXml(product.meta_title)}</language>
    </meta_title>
    <meta_description>
      <language id="1">${this.escapeXml(product.meta_description)}</language>
    </meta_description>
    <meta_keywords>
      <language id="1">${this.escapeXml(product.meta_keywords)}</language>
    </meta_keywords>
    <weight>${product.weight}</weight>
    <width>${product.width}</width>
    <height>${product.height}</height>
    <depth>${product.depth}</depth>
  </product>
</prestashop>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Log export to history
   */
  private async logExport(userId: string, totalProducts: number): Promise<void> {
    await pool.query(
      `INSERT INTO export_history (export_type, total_products, status, exported_by)
       VALUES ($1, $2, $3, $4)`,
      ['prestashop', totalProducts, 'completed', userId]
    );
  }
}

export default new ExportService();
