import pool from '../config/database';
import cvaApiService from './cvaApiService';
import cvaAuthService from './cvaAuthService';

interface SyncResult {
  syncId: string;
  syncType: string;
  totalProcessed: number;
  totalUpdated: number;
  totalCreated: number;
  totalFailed: number;
  errors: Array<{ clave?: string; error: string }>;
  duration: number; // milisegundos
}

interface SyncProgress {
  syncId: string;
  currentPage: number;
  totalPages: number;
  processedItems: number;
  status: string;
}

export class CVASyncService {
  /**
   * Sincronización completa (inventario + precios + nuevos productos)
   */
  async fullSync(userId: string): Promise<SyncResult> {
    console.log('Iniciando sincronización completa con CVA API...');

    const startTime = Date.now();
    const syncId = await this.createSyncHistory(userId, 'full');

    const result: SyncResult = {
      syncId,
      syncType: 'full',
      totalProcessed: 0,
      totalUpdated: 0,
      totalCreated: 0,
      totalFailed: 0,
      errors: [],
      duration: 0
    };

    try {
      // Obtener configuración
      const config = await cvaAuthService.getSyncOptions();

      if (!config) {
        throw new Error('CVA API no configurada');
      }

      // Determinar qué sincronizar
      const syncInventory = config.sync_inventory;
      const syncPrices = config.sync_prices;
      const syncNewProducts = config.sync_new_products;

      // Determinar filtro de existencias
      let existFilter = 0; // Todos los productos por defecto
      if (config.stock_source === 'branch') existFilter = 1;
      else if (config.stock_source === 'cedis') existFilter = 2;
      else if (config.stock_source === 'both') existFilter = 3;

      // Sincronizar por páginas
      let currentPage = 1;
      let totalPages = 1;

      while (currentPage <= totalPages) {
        try {
          console.log(`Procesando página ${currentPage}/${totalPages}...`);

          const response = await cvaApiService.fetchProducts({
            exist: existFilter,
            promos: config.sync_promotions,
            images: config.sync_images,
            page: currentPage
          });

          if (response.paginacion) {
            totalPages = response.paginacion.total_pages;
          }

          // Procesar productos de esta página
          for (const cvaProduct of response.data) {
            try {
              // Verificar si el producto existe
              const exists = await this.productExists(cvaProduct.clave);

              if (exists) {
                // Actualizar existente
                if (syncInventory || syncPrices) {
                  await cvaApiService.processAndSaveProduct(cvaProduct, true);
                  result.totalUpdated++;
                }
              } else {
                // Crear nuevo producto si está habilitado
                if (syncNewProducts) {
                  await cvaApiService.processAndSaveProduct(cvaProduct, false);
                  result.totalCreated++;
                }
              }

              result.totalProcessed++;
            } catch (error) {
              result.totalFailed++;
              result.errors.push({
                clave: cvaProduct.clave,
                error: error instanceof Error ? error.message : 'Error desconocido'
              });
              console.error(`Error procesando producto ${cvaProduct.clave}:`, error);
            }
          }

          // Actualizar progreso
          await this.updateSyncProgress(syncId, currentPage, totalPages, result.totalProcessed);

          currentPage++;

          // Pequeña pausa entre páginas para no sobrecargar la API
          await this.sleep(500);
        } catch (error) {
          console.error(`Error en página ${currentPage}:`, error);
          result.totalFailed++;
          result.errors.push({
            error: `Error en página ${currentPage}: ${error instanceof Error ? error.message : 'Error desconocido'}`
          });
          currentPage++;
        }
      }

      result.duration = Date.now() - startTime;

      await this.completeSyncHistory(syncId, result);

      console.log(`Sincronización completa finalizada. Procesados: ${result.totalProcessed}, Actualizados: ${result.totalUpdated}, Creados: ${result.totalCreated}, Errores: ${result.totalFailed}`);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      await this.failSyncHistory(syncId, error instanceof Error ? error.message : 'Error desconocido');
      throw error;
    }
  }

  /**
   * Sincronizar solo inventario
   */
  async inventorySync(userId: string): Promise<SyncResult> {
    console.log('Iniciando sincronización de inventario...');

    const startTime = Date.now();
    const syncId = await this.createSyncHistory(userId, 'inventory');

    const result: SyncResult = {
      syncId,
      syncType: 'inventory',
      totalProcessed: 0,
      totalUpdated: 0,
      totalCreated: 0,
      totalFailed: 0,
      errors: [],
      duration: 0
    };

    try {
      // Obtener todos los productos con mapeo CVA
      const mappedProducts = await pool.query(
        'SELECT clave FROM cva_product_mapping WHERE is_active_in_cva = true'
      );

      const totalProducts = mappedProducts.rows.length;

      for (let i = 0; i < totalProducts; i++) {
        const { clave } = mappedProducts.rows[i];

        try {
          const success = await cvaApiService.syncProductInventory(clave);

          if (success) {
            result.totalUpdated++;
          } else {
            result.totalFailed++;
            result.errors.push({ clave, error: 'Producto no encontrado en CVA' });
          }

          result.totalProcessed++;

          // Actualizar progreso cada 10 productos
          if (i % 10 === 0) {
            await this.updateSyncProgress(syncId, i, totalProducts, result.totalProcessed);
          }

          // Pausa cada 50 productos para no saturar la API
          if (i % 50 === 0 && i > 0) {
            await this.sleep(1000);
          }
        } catch (error) {
          result.totalFailed++;
          result.errors.push({
            clave,
            error: error instanceof Error ? error.message : 'Error desconocido'
          });
        }
      }

      result.duration = Date.now() - startTime;
      await this.completeSyncHistory(syncId, result);

      console.log(`Sincronización de inventario finalizada. Procesados: ${result.totalProcessed}, Actualizados: ${result.totalUpdated}`);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      await this.failSyncHistory(syncId, error instanceof Error ? error.message : 'Error desconocido');
      throw error;
    }
  }

  /**
   * Sincronizar solo precios
   */
  async priceSync(userId: string): Promise<SyncResult> {
    console.log('Iniciando sincronización de precios...');

    const startTime = Date.now();
    const syncId = await this.createSyncHistory(userId, 'prices');

    const result: SyncResult = {
      syncId,
      syncType: 'prices',
      totalProcessed: 0,
      totalUpdated: 0,
      totalCreated: 0,
      totalFailed: 0,
      errors: [],
      duration: 0
    };

    try {
      const mappedProducts = await pool.query(
        'SELECT clave FROM cva_product_mapping WHERE is_active_in_cva = true'
      );

      const totalProducts = mappedProducts.rows.length;

      for (let i = 0; i < totalProducts; i++) {
        const { clave } = mappedProducts.rows[i];

        try {
          const success = await cvaApiService.syncProductPrice(clave);

          if (success) {
            result.totalUpdated++;
          } else {
            result.totalFailed++;
            result.errors.push({ clave, error: 'Producto no encontrado en CVA' });
          }

          result.totalProcessed++;

          if (i % 10 === 0) {
            await this.updateSyncProgress(syncId, i, totalProducts, result.totalProcessed);
          }

          if (i % 50 === 0 && i > 0) {
            await this.sleep(1000);
          }
        } catch (error) {
          result.totalFailed++;
          result.errors.push({
            clave,
            error: error instanceof Error ? error.message : 'Error desconocido'
          });
        }
      }

      result.duration = Date.now() - startTime;
      await this.completeSyncHistory(syncId, result);

      console.log(`Sincronización de precios finalizada. Procesados: ${result.totalProcessed}, Actualizados: ${result.totalUpdated}`);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      await this.failSyncHistory(syncId, error instanceof Error ? error.message : 'Error desconocido');
      throw error;
    }
  }

  /**
   * Descubrir y agregar nuevos productos
   */
  async discoverNewProducts(userId: string, filters?: { marca?: string; grupo?: string; desc?: string }): Promise<SyncResult> {
    console.log('Buscando nuevos productos en CVA...');

    const startTime = Date.now();
    const syncId = await this.createSyncHistory(userId, 'new_products');

    const result: SyncResult = {
      syncId,
      syncType: 'new_products',
      totalProcessed: 0,
      totalUpdated: 0,
      totalCreated: 0,
      totalFailed: 0,
      errors: [],
      duration: 0
    };

    try {
      const config = await cvaAuthService.getSyncOptions();
      let existFilter = 0;
      if (config?.stock_source === 'branch') existFilter = 1;
      else if (config?.stock_source === 'cedis') existFilter = 2;
      else if (config?.stock_source === 'both') existFilter = 3;

      let currentPage = 1;
      let totalPages = 1;

      while (currentPage <= totalPages) {
        const response = await cvaApiService.fetchProducts({
          exist: existFilter,
          images: true,
          page: currentPage,
          ...filters
        });

        if (response.paginacion) {
          totalPages = response.paginacion.total_pages;
        }

        for (const cvaProduct of response.data) {
          try {
            const exists = await this.productExists(cvaProduct.clave);

            if (!exists) {
              await cvaApiService.processAndSaveProduct(cvaProduct, false);
              result.totalCreated++;
            }

            result.totalProcessed++;
          } catch (error) {
            result.totalFailed++;
            result.errors.push({
              clave: cvaProduct.clave,
              error: error instanceof Error ? error.message : 'Error desconocido'
            });
          }
        }

        await this.updateSyncProgress(syncId, currentPage, totalPages, result.totalProcessed);

        currentPage++;
        await this.sleep(500);
      }

      result.duration = Date.now() - startTime;
      await this.completeSyncHistory(syncId, result);

      console.log(`Descubrimiento finalizado. Nuevos productos: ${result.totalCreated}`);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      await this.failSyncHistory(syncId, error instanceof Error ? error.message : 'Error desconocido');
      throw error;
    }
  }

  /**
   * Sincronizar catálogos (marcas, grupos, sucursales)
   */
  async syncCatalogs(): Promise<{ branches: number; errors: number }> {
    console.log('Sincronizando catálogos de CVA...');

    const branchesResult = await cvaApiService.syncBranches();

    console.log(`Catálogos sincronizados. Sucursales: ${branchesResult.synced}`);

    return {
      branches: branchesResult.synced,
      errors: branchesResult.errors
    };
  }

  // Helper methods

  private async productExists(clave: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT id FROM cva_product_mapping WHERE clave = $1 LIMIT 1',
      [clave]
    );
    return result.rows.length > 0;
  }

  private async createSyncHistory(userId: string, syncType: string): Promise<string> {
    const result = await pool.query(
      `INSERT INTO cva_sync_history (sync_type, user_id, status)
       VALUES ($1, $2, 'running')
       RETURNING id`,
      [syncType, userId]
    );
    return result.rows[0].id;
  }

  private async updateSyncProgress(syncId: string, currentPage: number, totalPages: number, processed: number): Promise<void> {
    await pool.query(
      `UPDATE cva_sync_history SET
        current_page = $1,
        total_pages = $2,
        products_processed = $3
      WHERE id = $4`,
      [currentPage, totalPages, processed, syncId]
    );
  }

  private async completeSyncHistory(syncId: string, result: SyncResult): Promise<void> {
    await pool.query(
      `UPDATE cva_sync_history SET
        status = 'completed',
        finished_at = CURRENT_TIMESTAMP,
        products_processed = $1,
        products_updated = $2,
        products_created = $3,
        products_failed = $4,
        errors = $5,
        summary = $6
      WHERE id = $7`,
      [
        result.totalProcessed,
        result.totalUpdated,
        result.totalCreated,
        result.totalFailed,
        JSON.stringify(result.errors),
        JSON.stringify({
          duration: result.duration,
          syncType: result.syncType
        }),
        syncId
      ]
    );
  }

  private async failSyncHistory(syncId: string, errorMessage: string): Promise<void> {
    await pool.query(
      `UPDATE cva_sync_history SET
        status = 'failed',
        finished_at = CURRENT_TIMESTAMP,
        errors = $1
      WHERE id = $2`,
      [JSON.stringify([{ error: errorMessage }]), syncId]
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new CVASyncService();
