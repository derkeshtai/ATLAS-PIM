import axios, { AxiosInstance } from 'axios';
import pool from '../config/database';
import crypto from 'crypto';

interface CVAAuthResponse {
  token: string;
  expires_in?: number; // En segundos
}

interface CVAConfig {
  accountNumber: string;
  passwordEncrypted: string;
  apiToken: string | null;
  tokenExpiresAt: Date | null;
}

export class CVAAuthService {
  private readonly baseUrl = process.env.CVA_API_URL || 'https://apicvaservices.grupocva.com';
  private readonly encryptionKey: string;
  private httpClient: AxiosInstance;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Clave de encriptación (debe estar en .env en producción)
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32b';

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Obtener o crear configuración CVA
   */
  async getConfig(): Promise<CVAConfig | null> {
    const result = await pool.query(
      'SELECT account_number, password_encrypted, api_token, token_expires_at FROM cva_config LIMIT 1'
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      accountNumber: row.account_number,
      passwordEncrypted: row.password_encrypted,
      apiToken: row.api_token,
      tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null
    };
  }

  /**
   * Guardar o actualizar configuración CVA
   */
  async saveConfig(accountNumber: string, password: string, options?: any): Promise<void> {
    const passwordEncrypted = this.encrypt(password);

    const existingConfig = await this.getConfig();

    if (existingConfig) {
      // Actualizar
      await pool.query(
        `UPDATE cva_config SET
          account_number = $1,
          password_encrypted = $2,
          sync_inventory = COALESCE($3, sync_inventory),
          sync_prices = COALESCE($4, sync_prices),
          sync_new_products = COALESCE($5, sync_new_products),
          sync_promotions = COALESCE($6, sync_promotions),
          auto_sync_enabled = COALESCE($7, auto_sync_enabled),
          updated_at = CURRENT_TIMESTAMP`,
        [
          accountNumber,
          passwordEncrypted,
          options?.syncInventory,
          options?.syncPrices,
          options?.syncNewProducts,
          options?.syncPromotions,
          options?.autoSyncEnabled
        ]
      );
    } else {
      // Crear
      await pool.query(
        `INSERT INTO cva_config (
          account_number,
          password_encrypted,
          sync_inventory,
          sync_prices,
          sync_new_products,
          sync_promotions,
          auto_sync_enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          accountNumber,
          passwordEncrypted,
          options?.syncInventory ?? true,
          options?.syncPrices ?? true,
          options?.syncNewProducts ?? true,
          options?.syncPromotions ?? true,
          options?.autoSyncEnabled ?? false
        ]
      );
    }
  }

  /**
   * Obtener token válido (renueva si es necesario)
   */
  async getValidToken(): Promise<string> {
    const config = await this.getConfig();

    if (!config) {
      throw new Error('CVA API no configurada. Configure las credenciales primero.');
    }

    // Verificar si el token actual es válido
    if (config.apiToken && config.tokenExpiresAt) {
      const now = new Date();
      const expiresIn = config.tokenExpiresAt.getTime() - now.getTime();
      const minutesLeft = expiresIn / (1000 * 60);

      // Si faltan más de 30 minutos, usar el token actual
      if (minutesLeft > 30) {
        return config.apiToken;
      }
    }

    // Token expirado o a punto de expirar, renovar
    console.log('Token CVA expirado o a punto de expirar, renovando...');
    const newToken = await this.login(config.accountNumber, config.passwordEncrypted);
    return newToken;
  }

  /**
   * Login a CVA API y obtener token
   */
  async login(accountNumber: string, passwordEncrypted: string): Promise<string> {
    try {
      const password = this.decrypt(passwordEncrypted);

      const response = await this.httpClient.post<CVAAuthResponse>(
        '/api/v2/user/login',
        {
          user: accountNumber,
          password: password
        }
      );

      if (!response.data || !response.data.token) {
        throw new Error('Respuesta inválida de CVA API: no se recibió token');
      }

      const token = response.data.token;
      const expiresIn = response.data.expires_in || 12 * 60 * 60; // Default 12 horas en segundos

      // Calcular fecha de expiración
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

      // Guardar token en base de datos
      await pool.query(
        `UPDATE cva_config SET
          api_token = $1,
          token_expires_at = $2,
          updated_at = CURRENT_TIMESTAMP`,
        [token, expiresAt]
      );

      console.log(`Token CVA obtenido exitosamente. Expira: ${expiresAt.toISOString()}`);

      // Programar renovación automática (11 horas)
      this.scheduleTokenRefresh(expiresIn);

      return token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;

        if (status === 401 || status === 403) {
          throw new Error(`Credenciales CVA inválidas: ${message}`);
        }

        throw new Error(`Error al autenticar con CVA API: ${message}`);
      }

      throw error;
    }
  }

  /**
   * Programar renovación automática del token
   */
  scheduleTokenRefresh(expiresIn: number): void {
    // Cancelar timer anterior si existe
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }

    // Renovar 1 hora antes de expirar
    const refreshIn = (expiresIn - 3600) * 1000; // Convertir a milisegundos

    if (refreshIn > 0) {
      this.tokenRefreshTimer = setTimeout(async () => {
        try {
          console.log('Renovando token CVA automáticamente...');
          await this.getValidToken(); // Esto renovará el token
        } catch (error) {
          console.error('Error al renovar token CVA automáticamente:', error);
        }
      }, refreshIn);

      const refreshAt = new Date(Date.now() + refreshIn);
      console.log(`Renovación automática programada para: ${refreshAt.toISOString()}`);
    }
  }

  /**
   * Verificar si las credenciales son válidas
   */
  async testCredentials(accountNumber: string, password: string): Promise<boolean> {
    try {
      const response = await this.httpClient.post('/api/v2/user/login', {
        user: accountNumber,
        password: password
      });

      return !!response.data?.token;
    } catch (error) {
      return false;
    }
  }

  /**
   * Encriptar password
   */
  private encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Desencriptar password
   */
  private decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Obtener configuración de sincronización
   */
  async getSyncOptions(): Promise<any> {
    const result = await pool.query(`
      SELECT
        sync_inventory,
        sync_prices,
        sync_new_products,
        sync_promotions,
        sync_images,
        auto_sync_enabled,
        sync_inventory_cron,
        sync_prices_cron,
        sync_new_products_cron,
        stock_source,
        include_out_of_stock
      FROM cva_config
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Actualizar opciones de sincronización
   */
  async updateSyncOptions(options: any): Promise<void> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (options.syncInventory !== undefined) {
      fields.push(`sync_inventory = $${paramCount++}`);
      values.push(options.syncInventory);
    }

    if (options.syncPrices !== undefined) {
      fields.push(`sync_prices = $${paramCount++}`);
      values.push(options.syncPrices);
    }

    if (options.syncNewProducts !== undefined) {
      fields.push(`sync_new_products = $${paramCount++}`);
      values.push(options.syncNewProducts);
    }

    if (options.syncPromotions !== undefined) {
      fields.push(`sync_promotions = $${paramCount++}`);
      values.push(options.syncPromotions);
    }

    if (options.syncImages !== undefined) {
      fields.push(`sync_images = $${paramCount++}`);
      values.push(options.syncImages);
    }

    if (options.autoSyncEnabled !== undefined) {
      fields.push(`auto_sync_enabled = $${paramCount++}`);
      values.push(options.autoSyncEnabled);
    }

    if (options.stockSource !== undefined) {
      fields.push(`stock_source = $${paramCount++}`);
      values.push(options.stockSource);
    }

    if (fields.length === 0) {
      return;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    await pool.query(
      `UPDATE cva_config SET ${fields.join(', ')}`,
      values
    );
  }

  /**
   * Limpiar token (logout)
   */
  async clearToken(): Promise<void> {
    await pool.query(
      `UPDATE cva_config SET
        api_token = NULL,
        token_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP`
    );

    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }
}

export default new CVAAuthService();
