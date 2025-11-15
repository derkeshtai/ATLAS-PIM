import csv from 'csv-parser';
import xlsx from 'xlsx';
import { Readable } from 'stream';
import pool from '../config/database';
import productService from './productService';
import imageService from './imageService';
import { Product } from '../models/Product';

export interface ImportResult {
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  errors: Array<{ row: number; error: string; data?: any }>;
}

export class ImportService {
  /**
   * Import products from CSV file
   */
  async importFromCSV(
    fileBuffer: Buffer,
    userId: string,
    columnMapping?: Record<string, string>
  ): Promise<ImportResult> {
    const result: ImportResult = {
      total_rows: 0,
      successful_rows: 0,
      failed_rows: 0,
      errors: [],
    };

    // Create import history record
    const historyQuery = `
      INSERT INTO import_history (filename, file_type, status, imported_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const historyResult = await pool.query(historyQuery, [
      'import.csv',
      'csv',
      'processing',
      userId,
    ]);

    const importId = historyResult.rows[0].id;

    try {
      const products: any[] = [];

      // Parse CSV
      await new Promise((resolve, reject) => {
        const stream = Readable.from(fileBuffer);

        stream
          .pipe(csv())
          .on('data', (row) => {
            products.push(row);
          })
          .on('end', resolve)
          .on('error', reject);
      });

      result.total_rows = products.length;

      // Process each product
      for (let i = 0; i < products.length; i++) {
        try {
          const row = products[i];
          const productData = this.mapCSVRow(row, columnMapping);

          // Check if product exists by SKU or supplier SKU
          const existingProduct = await productService.getProductBySKU(
            productData.sku || productData.supplier_sku
          );

          if (existingProduct) {
            // Update existing product
            await productService.updateProduct(existingProduct.id!, productData);
          } else {
            // Create new product
            await productService.createProduct(productData);
          }

          // Process images if image URL is provided
          if (row.image_url || row.imageUrl) {
            try {
              const imageUrl = row.image_url || row.imageUrl;
              const imageResult = await imageService.processImageFromUrl(imageUrl);

              const product = await productService.getProductBySKU(productData.sku);
              if (product) {
                await productService.addProductImage({
                  product_id: product.id!,
                  url: imageResult.url,
                  thumbnail_url: imageResult.thumbnail_url,
                  width: imageResult.width,
                  height: imageResult.height,
                  file_size: imageResult.file_size,
                  is_primary: true,
                });
              }
            } catch (imageError) {
              console.error('Error processing image:', imageError);
              // Continue even if image processing fails
            }
          }

          result.successful_rows++;
        } catch (error: any) {
          result.failed_rows++;
          result.errors.push({
            row: i + 1,
            error: error.message,
            data: products[i],
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
          result.total_rows,
          result.successful_rows,
          result.failed_rows,
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
   * Import products from Excel file
   */
  async importFromExcel(
    fileBuffer: Buffer,
    userId: string,
    columnMapping?: Record<string, string>
  ): Promise<ImportResult> {
    const result: ImportResult = {
      total_rows: 0,
      successful_rows: 0,
      failed_rows: 0,
      errors: [],
    };

    // Create import history record
    const historyQuery = `
      INSERT INTO import_history (filename, file_type, status, imported_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const historyResult = await pool.query(historyQuery, [
      'import.xlsx',
      'excel',
      'processing',
      userId,
    ]);

    const importId = historyResult.rows[0].id;

    try {
      // Parse Excel
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const products = xlsx.utils.sheet_to_json(worksheet);

      result.total_rows = products.length;

      // Process each product
      for (let i = 0; i < products.length; i++) {
        try {
          const row: any = products[i];
          const productData = this.mapCSVRow(row, columnMapping);

          // Check if product exists
          const existingProduct = await productService.getProductBySKU(
            productData.sku || productData.supplier_sku
          );

          if (existingProduct) {
            // Update existing product
            await productService.updateProduct(existingProduct.id!, productData);
          } else {
            // Create new product
            await productService.createProduct(productData);
          }

          // Process images if image URL is provided
          if (row.image_url || row.imageUrl) {
            try {
              const imageUrl = row.image_url || row.imageUrl;
              const imageResult = await imageService.processImageFromUrl(imageUrl);

              const product = await productService.getProductBySKU(productData.sku);
              if (product) {
                await productService.addProductImage({
                  product_id: product.id!,
                  url: imageResult.url,
                  thumbnail_url: imageResult.thumbnail_url,
                  width: imageResult.width,
                  height: imageResult.height,
                  file_size: imageResult.file_size,
                  is_primary: true,
                });
              }
            } catch (imageError) {
              console.error('Error processing image:', imageError);
              // Continue even if image processing fails
            }
          }

          result.successful_rows++;
        } catch (error: any) {
          result.failed_rows++;
          result.errors.push({
            row: i + 1,
            error: error.message,
            data: products[i],
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
          result.total_rows,
          result.successful_rows,
          result.failed_rows,
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
   * Map CSV row to Product model
   */
  private mapCSVRow(row: any, columnMapping?: Record<string, string>): Product {
    const mapping = columnMapping || {
      sku: 'sku',
      name: 'name',
      description: 'description',
      price: 'price',
      stock: 'stock',
    };

    return {
      sku: row[mapping.sku] || row.sku || row.SKU,
      name: row[mapping.name] || row.name || row.Name,
      short_description: row[mapping.description] || row.description || row.Description,
      price: parseFloat(row[mapping.price] || row.price || row.Price || 0),
      stock_quantity: parseInt(row[mapping.stock] || row.stock || row.Stock || 0),
      supplier_name: row.supplier || row.Supplier,
      supplier_sku: row.supplier_sku || row.SupplierSKU,
      supplier_notes: row.notes || row.Notes,
    };
  }

  /**
   * Get import history
   */
  async getImportHistory(page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const query = `
      SELECT ih.*, u.email as imported_by_email
      FROM import_history ih
      LEFT JOIN users u ON ih.imported_by = u.id
      ORDER BY ih.started_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    const countQuery = 'SELECT COUNT(*) FROM import_history';
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export default new ImportService();
