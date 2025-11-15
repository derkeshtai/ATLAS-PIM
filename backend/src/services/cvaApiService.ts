import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import pool from '../config/database';
import cvaAuthService from './cvaAuthService';
import imageService from './imageService';

interface CVAProduct {
  id: string;
  clave: string;
  codigo_fabricante?: string;
  descripcion: string;
  marca?: string;
  grupo?: string;
  subgrupo?: string;
  precio: number;
  moneda: string;
  disponible: number; // Stock sucursal
  disponibleCD: number; // Stock CEDIS
  imagen?: string;
  garantia?: string;
  // ... más campos según la respuesta real
}

interface CVAProductsResponse {
  data: CVAProduct[];
  paginacion?: {
    total_pages: number;
    current_page: number;
    total_items: number;
  };
}

interface CVABranch {
  codigo: string;
  nombre: string;
  ciudad?: string;
  estado?: string;
}

interface CVABrand {
  id: string;
  nombre: string;
}

interface CVAGroup {
  id: string;
  nombre: string;
  descripcion?: string;
}

interface FetchProductsOptions {
  clave?: string;
  codigo?: string;
  marca?: string;
  grupo?: string;
  desc?: string;
  exist?: number; // 0=todos, 1=sucursal, 2=CEDIS, 3=ambos
  promos?: boolean;
  images?: boolean;
  sucursales?: boolean;
  page?: number;
}

export class CVAApiService {
  private readonly baseUrl = process.env.CVA_API_URL || 'https://apicvaservices.grupocva.com';
  private httpClient: AxiosInstance;

  constructor() {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Configurar retry automático
    axiosRetry(this.httpClient, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               error.response?.status === 429 || // Too many requests
               error.response?.status === 503;   // Service unavailable
      }
    });
  }

  /**
   * Obtener headers con autenticación
   */
  private async getAuthHeaders(): Promise<any> {
    const token = await cvaAuthService.getValidToken();
    return {
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Obtener productos desde CVA API
   */
  async fetchProducts(options: FetchProductsOptions = {}): Promise<CVAProductsResponse> {
    try {
      const headers = await this.getAuthHeaders();

      // Construir parámetros
      const params: any = {
        page: options.page || 1
      };

      if (options.clave) params.clave = options.clave;
      if (options.codigo) params.codigo = options.codigo;
      if (options.marca) params.marca = options.marca;
      if (options.grupo) params.grupo = options.grupo;
      if (options.desc) params.desc = options.desc;
      if (options.exist !== undefined) params.exist = options.exist;
      if (options.promos) params.promos = 'true';
      if (options.images) params.images = 'true';
      if (options.sucursales) params.sucursales = 'true';

      const response = await this.httpClient.get('/api/v2/catalogo_clientes/lista_precios', {
        headers,
        params
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Error al obtener productos de CVA: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Obtener producto por clave CVA
   */
  async fetchProductByClave(clave: string): Promise<CVAProduct | null> {
    const response = await this.fetchProducts({ clave });

    if (response.data && response.data.length > 0) {
      return response.data[0];
    }

    return null;
  }

  /**
   * Obtener catálogo de marcas
   */
  async fetchBrands(): Promise<CVABrand[]> {
    try {
      // Este endpoint no requiere auth según la doc
      const response = await this.httpClient.get('/api/v2/catalogo_clientes/marcas');
      return response.data || [];
    } catch (error) {
      console.error('Error al obtener marcas de CVA:', error);
      return [];
    }
  }

  /**
   * Obtener catálogo de grupos (categorías)
   */
  async fetchGroups(): Promise<CVAGroup[]> {
    try {
      const response = await this.httpClient.get('/api/v2/catalogo_clientes/grupos');
      return response.data || [];
    } catch (error) {
      console.error('Error al obtener grupos de CVA:', error);
      return [];
    }
  }

  /**
   * Obtener catálogo de sucursales
   */
  async fetchBranches(): Promise<CVABranch[]> {
    try {
      const response = await this.httpClient.get('/api/v2/catalogo_clientes/sucursales');
      return response.data || [];
    } catch (error) {
      console.error('Error al obtener sucursales de CVA:', error);
      return [];
    }
  }

  /**
   * Sincronizar catálogo de sucursales en base de datos
   */
  async syncBranches(): Promise<{ synced: number; errors: number }> {
    const branches = await this.fetchBranches();
    let synced = 0;
    let errors = 0;

    const client = await pool.connect();

    try {
      for (const branch of branches) {
        try {
          await client.query(
            `INSERT INTO cva_branches (branch_code, branch_name, city, is_active)
             VALUES ($1, $2, $3, true)
             ON CONFLICT (branch_code) DO UPDATE SET
               branch_name = $2,
               city = $3,
               updated_at = CURRENT_TIMESTAMP`,
            [branch.codigo, branch.nombre, branch.ciudad]
          );
          synced++;
        } catch (error) {
          console.error(`Error al sincronizar sucursal ${branch.codigo}:`, error);
          errors++;
        }
      }
    } finally {
      client.release();
    }

    return { synced, errors };
  }

  /**
   * Procesar y guardar producto de CVA en base de datos
   */
  async processAndSaveProduct(cvaProduct: CVAProduct, updateOnly: boolean = false): Promise<string | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Buscar si el producto ya existe por clave CVA
      let productId: string | null = null;

      const existingMapping = await client.query(
        'SELECT product_id FROM cva_product_mapping WHERE clave = $1',
        [cvaProduct.clave]
      );

      if (existingMapping.rows.length > 0) {
        productId = existingMapping.rows[0].product_id;
      }

      // Si updateOnly y no existe, saltar
      if (updateOnly && !productId) {
        await client.query('ROLLBACK');
        return null;
      }

      // Si no existe y no es updateOnly, crear producto
      if (!productId) {
        // Buscar o crear marca
        let brandId = null;
        if (cvaProduct.marca) {
          const brandResult = await client.query(
            `INSERT INTO brands (name, slug, is_active)
             VALUES ($1, $2, true)
             ON CONFLICT (slug) DO UPDATE SET name = $1
             RETURNING id`,
            [cvaProduct.marca, this.slugify(cvaProduct.marca)]
          );
          brandId = brandResult.rows[0].id;
        }

        // Buscar o crear categoría (grupo)
        let categoryId = null;
        if (cvaProduct.grupo) {
          const categoryResult = await client.query(
            `INSERT INTO categories (name, slug, is_active)
             VALUES ($1, $2, true)
             ON CONFLICT (slug) DO UPDATE SET name = $1
             RETURNING id`,
            [cvaProduct.grupo, this.slugify(cvaProduct.grupo)]
          );
          categoryId = categoryResult.rows[0].id;
        }

        // Crear producto
        const productResult = await client.query(
          `INSERT INTO products (
            sku,
            name,
            slug,
            short_description,
            brand_id,
            category_id,
            price,
            currency,
            stock_quantity,
            warranty,
            cva_clave,
            supplier_sku,
            manufacturer_code,
            curation_status,
            is_active,
            last_cva_sync
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'not_curated', true, CURRENT_TIMESTAMP)
          RETURNING id`,
          [
            cvaProduct.clave, // SKU = clave CVA
            cvaProduct.descripcion,
            this.slugify(cvaProduct.descripcion),
            cvaProduct.descripcion,
            brandId,
            categoryId,
            cvaProduct.precio,
            cvaProduct.moneda || 'MXN',
            cvaProduct.disponible + cvaProduct.disponibleCD,
            cvaProduct.garantia,
            cvaProduct.clave,
            cvaProduct.clave,
            cvaProduct.codigo_fabricante
          ]
        );

        productId = productResult.rows[0].id;

        // Descargar imagen si existe
        if (cvaProduct.imagen) {
          try {
            const imageResult = await imageService.processImageFromUrl(cvaProduct.imagen);

            await client.query(
              `INSERT INTO product_images (
                product_id,
                url,
                thumbnail_url,
                alt_text,
                is_primary,
                width,
                height,
                file_size,
                display_order
              ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, 0)`,
              [
                productId,
                imageResult.url,
                imageResult.thumbnailUrl,
                cvaProduct.descripcion,
                imageResult.width,
                imageResult.height,
                imageResult.fileSize
              ]
            );
          } catch (error) {
            console.warn(`No se pudo procesar imagen para ${cvaProduct.clave}:`, error);
          }
        }
      } else {
        // Actualizar producto existente
        await client.query(
          `UPDATE products SET
            price = $1,
            stock_quantity = $2,
            currency = $3,
            last_cva_sync = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4`,
          [
            cvaProduct.precio,
            cvaProduct.disponible + cvaProduct.disponibleCD,
            cvaProduct.moneda || 'MXN',
            productId
          ]
        );
      }

      // Actualizar o crear mapeo CVA
      await client.query(
        `INSERT INTO cva_product_mapping (
          product_id,
          clave,
          codigo_fabricante,
          stock_branch,
          stock_cedis,
          last_price,
          last_currency,
          last_synced,
          last_inventory_sync,
          last_price_sync
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (clave) DO UPDATE SET
          stock_branch = $4,
          stock_cedis = $5,
          last_price = $6,
          last_currency = $7,
          last_synced = CURRENT_TIMESTAMP,
          last_inventory_sync = CURRENT_TIMESTAMP,
          last_price_sync = CURRENT_TIMESTAMP,
          sync_errors = 0,
          is_active_in_cva = true`,
        [
          productId,
          cvaProduct.clave,
          cvaProduct.codigo_fabricante,
          cvaProduct.disponible,
          cvaProduct.disponibleCD,
          cvaProduct.precio,
          cvaProduct.moneda || 'MXN'
        ]
      );

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
   * Sincronizar inventario de un producto
   */
  async syncProductInventory(clave: string): Promise<boolean> {
    try {
      const cvaProduct = await this.fetchProductByClave(clave);

      if (!cvaProduct) {
        return false;
      }

      await pool.query(
        `UPDATE products p SET
          stock_quantity = $1,
          last_cva_sync = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        FROM cva_product_mapping m
        WHERE m.product_id = p.id AND m.clave = $2`,
        [cvaProduct.disponible + cvaProduct.disponibleCD, clave]
      );

      await pool.query(
        `UPDATE cva_product_mapping SET
          stock_branch = $1,
          stock_cedis = $2,
          last_inventory_sync = CURRENT_TIMESTAMP,
          last_synced = CURRENT_TIMESTAMP
        WHERE clave = $3`,
        [cvaProduct.disponible, cvaProduct.disponibleCD, clave]
      );

      return true;
    } catch (error) {
      console.error(`Error al sincronizar inventario de ${clave}:`, error);
      return false;
    }
  }

  /**
   * Sincronizar precio de un producto
   */
  async syncProductPrice(clave: string): Promise<boolean> {
    try {
      const cvaProduct = await this.fetchProductByClave(clave);

      if (!cvaProduct) {
        return false;
      }

      await pool.query(
        `UPDATE products p SET
          price = $1,
          currency = $2,
          last_cva_sync = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        FROM cva_product_mapping m
        WHERE m.product_id = p.id AND m.clave = $3`,
        [cvaProduct.precio, cvaProduct.moneda || 'MXN', clave]
      );

      await pool.query(
        `UPDATE cva_product_mapping SET
          last_price = $1,
          last_currency = $2,
          last_price_sync = CURRENT_TIMESTAMP,
          last_synced = CURRENT_TIMESTAMP
        WHERE clave = $3`,
        [cvaProduct.precio, cvaProduct.moneda || 'MXN', clave]
      );

      return true;
    } catch (error) {
      console.error(`Error al sincronizar precio de ${clave}:`, error);
      return false;
    }
  }

  /**
   * Helper para generar slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export default new CVAApiService();
