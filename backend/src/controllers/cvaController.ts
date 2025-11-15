import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import cvaAuthService from '../services/cvaAuthService';
import cvaSyncService from '../services/cvaSyncService';
import pool from '../config/database';
import { createSuccessResponse } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';

export class CVAController {
  /**
   * POST /api/v1/cva/config
   * Configurar credenciales y opciones de CVA
   */
  async saveConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { accountNumber, password, syncOptions } = req.body;

      if (!accountNumber || !password) {
        throw new AppError('Se requieren número de cuenta y contraseña', 400, 'MISSING_CREDENTIALS');
      }

      // Probar credenciales antes de guardar
      const valid = await cvaAuthService.testCredentials(accountNumber, password);

      if (!valid) {
        throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
      }

      // Guardar configuración
      await cvaAuthService.saveConfig(accountNumber, password, syncOptions);

      // Obtener token inicial
      const config = await cvaAuthService.getConfig();
      if (config) {
        await cvaAuthService.login(config.accountNumber, config.passwordEncrypted);
      }

      res.json(createSuccessResponse({
        message: 'Configuración CVA guardada exitosamente',
        configured: true
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/cva/config
   * Obtener configuración actual (sin credenciales sensibles)
   */
  async getConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const config = await cvaAuthService.getConfig();
      const syncOptions = await cvaAuthService.getSyncOptions();

      if (!config) {
        return res.json(createSuccessResponse({
          configured: false,
          message: 'CVA API no configurada'
        }));
      }

      const tokenValid = config.apiToken && config.tokenExpiresAt && new Date(config.tokenExpiresAt) > new Date();

      res.json(createSuccessResponse({
        configured: true,
        accountNumber: config.accountNumber,
        tokenValid,
        tokenExpiresAt: config.tokenExpiresAt,
        syncOptions
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/cva/config/sync-options
   * Actualizar opciones de sincronización
   */
  async updateSyncOptions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const options = req.body;

      await cvaAuthService.updateSyncOptions(options);

      res.json(createSuccessResponse({
        message: 'Opciones de sincronización actualizadas',
        options: await cvaAuthService.getSyncOptions()
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cva/sync/full
   * Sincronización completa
   */
  async fullSync(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        throw new AppError('Usuario no autenticado', 401, 'NOT_AUTHENTICATED');
      }

      // Verificar que CVA esté configurado
      const config = await cvaAuthService.getConfig();
      if (!config) {
        throw new AppError('CVA API no configurada', 400, 'CVA_NOT_CONFIGURED');
      }

      const result = await cvaSyncService.fullSync(req.user.id);

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cva/sync/inventory
   * Sincronizar solo inventario
   */
  async inventorySync(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        throw new AppError('Usuario no autenticado', 401, 'NOT_AUTHENTICATED');
      }

      const config = await cvaAuthService.getConfig();
      if (!config) {
        throw new AppError('CVA API no configurada', 400, 'CVA_NOT_CONFIGURED');
      }

      const result = await cvaSyncService.inventorySync(req.user.id);

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cva/sync/prices
   * Sincronizar solo precios
   */
  async priceSync(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        throw new AppError('Usuario no autenticado', 401, 'NOT_AUTHENTICATED');
      }

      const config = await cvaAuthService.getConfig();
      if (!config) {
        throw new AppError('CVA API no configurada', 400, 'CVA_NOT_CONFIGURED');
      }

      const result = await cvaSyncService.priceSync(req.user.id);

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cva/discover
   * Descubrir nuevos productos
   */
  async discoverProducts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        throw new AppError('Usuario no autenticado', 401, 'NOT_AUTHENTICATED');
      }

      const config = await cvaAuthService.getConfig();
      if (!config) {
        throw new AppError('CVA API no configurada', 400, 'CVA_NOT_CONFIGURED');
      }

      const { marca, grupo, desc } = req.body;

      const result = await cvaSyncService.discoverNewProducts(req.user.id, { marca, grupo, desc });

      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cva/sync/catalogs
   * Sincronizar catálogos (sucursales, marcas, grupos)
   */
  async syncCatalogs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await cvaSyncService.syncCatalogs();

      res.json(createSuccessResponse({
        message: 'Catálogos sincronizados',
        ...result
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/cva/sync/history
   * Obtener historial de sincronizaciones
   */
  async getSyncHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const syncType = req.query.type as string;

      let query = `
        SELECT
          id,
          sync_type,
          started_at,
          finished_at,
          products_processed,
          products_updated,
          products_created,
          products_failed,
          status,
          summary
        FROM cva_sync_history
      `;

      const params: any[] = [];
      if (syncType) {
        query += ' WHERE sync_type = $1';
        params.push(syncType);
      }

      query += ' ORDER BY started_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM cva_sync_history';
      if (syncType) {
        countQuery += ' WHERE sync_type = $1';
      }
      const countResult = await pool.query(countQuery, syncType ? [syncType] : []);
      const total = parseInt(countResult.rows[0].count);

      res.json(createSuccessResponse({
        history: result.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/cva/sync/status/:syncId
   * Obtener estado de una sincronización específica
   */
  async getSyncStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { syncId } = req.params;

      const result = await pool.query(
        `SELECT * FROM cva_sync_history WHERE id = $1`,
        [syncId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Sincronización no encontrada', 404, 'SYNC_NOT_FOUND');
      }

      res.json(createSuccessResponse(result.rows[0]));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/cva/stats
   * Obtener estadísticas generales de CVA
   */
  async getStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_active_in_cva = true) as active_products,
          SUM(total_stock) as total_stock,
          COUNT(*) FILTER (WHERE total_stock > 0) as products_in_stock,
          COUNT(*) FILTER (WHERE last_synced > CURRENT_TIMESTAMP - INTERVAL '24 hours') as synced_last_24h,
          AVG(sync_errors) as avg_sync_errors
        FROM cva_product_mapping
      `);

      const lastSync = await pool.query(`
        SELECT sync_type, finished_at, products_processed, status
        FROM cva_sync_history
        WHERE status = 'completed'
        ORDER BY finished_at DESC
        LIMIT 1
      `);

      res.json(createSuccessResponse({
        products: stats.rows[0],
        lastSync: lastSync.rows[0] || null
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cva/test
   * Probar conexión con CVA API
   */
  async testConnection(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const config = await cvaAuthService.getConfig();

      if (!config) {
        throw new AppError('CVA API no configurada', 400, 'CVA_NOT_CONFIGURED');
      }

      // Intentar obtener token
      const token = await cvaAuthService.getValidToken();

      res.json(createSuccessResponse({
        message: 'Conexión exitosa con CVA API',
        connected: true,
        tokenValid: !!token
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/cva/config
   * Eliminar configuración de CVA
   */
  async deleteConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await cvaAuthService.clearToken();
      await pool.query('DELETE FROM cva_config');

      res.json(createSuccessResponse({
        message: 'Configuración CVA eliminada'
      }));
    } catch (error) {
      next(error);
    }
  }
}

export default new CVAController();
