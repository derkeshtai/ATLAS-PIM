import pool from '../config/database';
import crypto from 'crypto';
import { AIProvider, ProductCurationInput } from './ai/AIProvider';
import { ClaudeProvider } from './ai/ClaudeProvider';
import { LMStudioProvider } from './ai/LMStudioProvider';

interface AIConfig {
  activeProvider: 'claude' | 'lmstudio';
  claudeApiKey?: string;
  claudeModel?: string;
  lmstudioEndpoint?: string;
  lmstudioModel?: string;
  autoC

urateNewProducts: boolean;
  skipIcecatCurated: boolean;
  requireManualApproval: boolean;
  maxProductsPerBatch: number;
  enableDescription: boolean;
  enableSEO: boolean;
  enableValidation: boolean;
}

interface CurationResult {
  productId: string;
  curationType: string;
  historyId: string;
  generatedContentId?: string;
  status: 'completed' | 'failed' | 'pending_approval';
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  costUSD?: number;
  durationMs: number;
}

export class AICurationService {
  private readonly encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32b';
  }

  /**
   * Obtener configuración de IA
   */
  async getConfig(): Promise<AIConfig | null> {
    const result = await pool.query(`
      SELECT
        active_provider,
        claude_api_key_encrypted,
        claude_model,
        lmstudio_endpoint,
        lmstudio_model,
        auto_curate_new_products,
        skip_icecat_curated,
        require_manual_approval,
        max_products_per_batch,
        enable_description,
        enable_seo,
        enable_validation
      FROM ai_curation_config
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      activeProvider: row.active_provider,
      claudeApiKey: row.claude_api_key_encrypted ? this.decrypt(row.claude_api_key_encrypted) : undefined,
      claudeModel: row.claude_model,
      lmstudioEndpoint: row.lmstudio_endpoint,
      lmstudioModel: row.lmstudio_model,
      autoCurateNewProducts: row.auto_curate_new_products,
      skipIcecatCurated: row.skip_icecat_curated,
      requireManualApproval: row.require_manual_approval,
      maxProductsPerBatch: row.max_products_per_batch,
      enableDescription: row.enable_description,
      enableSEO: row.enable_seo,
      enableValidation: row.enable_validation
    };
  }

  /**
   * Guardar configuración de IA
   */
  async saveConfig(config: Partial<AIConfig>): Promise<void> {
    const encryptedApiKey = config.claudeApiKey ? this.encrypt(config.claudeApiKey) : null;

    const existingConfig = await this.getConfig();

    if (existingConfig) {
      // Actualizar
      await pool.query(`
        UPDATE ai_curation_config SET
          active_provider = COALESCE($1, active_provider),
          claude_api_key_encrypted = COALESCE($2, claude_api_key_encrypted),
          claude_model = COALESCE($3, claude_model),
          lmstudio_endpoint = COALESCE($4, lmstudio_endpoint),
          lmstudio_model = COALESCE($5, lmstudio_model),
          auto_curate_new_products = COALESCE($6, auto_curate_new_products),
          skip_icecat_curated = COALESCE($7, skip_icecat_curated),
          require_manual_approval = COALESCE($8, require_manual_approval),
          max_products_per_batch = COALESCE($9, max_products_per_batch),
          enable_description = COALESCE($10, enable_description),
          enable_seo = COALESCE($11, enable_seo),
          enable_validation = COALESCE($12, enable_validation),
          updated_at = CURRENT_TIMESTAMP
      `, [
        config.activeProvider,
        encryptedApiKey,
        config.claudeModel,
        config.lmstudioEndpoint,
        config.lmstudioModel,
        config.autoCurateNewProducts,
        config.skipIcecatCurated,
        config.requireManualApproval,
        config.maxProductsPerBatch,
        config.enableDescription,
        config.enableSEO,
        config.enableValidation
      ]);
    } else {
      // Crear
      await pool.query(`
        INSERT INTO ai_curation_config (
          active_provider,
          claude_api_key_encrypted,
          claude_model,
          lmstudio_endpoint,
          lmstudio_model,
          auto_curate_new_products,
          skip_icecat_curated,
          require_manual_approval,
          max_products_per_batch,
          enable_description,
          enable_seo,
          enable_validation
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        config.activeProvider || 'claude',
        encryptedApiKey,
        config.claudeModel || 'claude-sonnet-4-5-20250929',
        config.lmstudioEndpoint,
        config.lmstudioModel,
        config.autoCurateNewProducts ?? false,
        config.skipIcecatCurated ?? true,
        config.requireManualApproval ?? true,
        config.maxProductsPerBatch || 10,
        config.enableDescription ?? true,
        config.enableSEO ?? true,
        config.enableValidation ?? true
      ]);
    }
  }

  /**
   * Obtener provider de IA activo
   */
  async getProvider(): Promise<AIProvider> {
    const config = await this.getConfig();

    if (!config) {
      throw new Error('AI curation not configured. Please configure AI settings first.');
    }

    if (config.activeProvider === 'claude') {
      if (!config.claudeApiKey) {
        throw new Error('Claude API key not configured');
      }
      return new ClaudeProvider(config.claudeApiKey, config.claudeModel);
    } else if (config.activeProvider === 'lmstudio') {
      if (!config.lmstudioEndpoint || !config.lmstudioModel) {
        throw new Error('LM Studio not configured');
      }
      return new LMStudioProvider(config.lmstudioEndpoint, config.lmstudioModel);
    }

    throw new Error(`Unknown AI provider: ${config.activeProvider}`);
  }

  /**
   * Curar un producto
   */
  async curateProduct(
    productId: string,
    curationType: 'description' | 'seo' | 'validation' | 'all',
    userId?: string
  ): Promise<CurationResult[]> {
    const config = await this.getConfig();
    if (!config) {
      throw new Error('AI curation not configured');
    }

    // Verificar si el producto necesita curación
    const shouldSkip = await this.shouldSkipProduct(productId, config);
    if (shouldSkip) {
      throw new Error('Product already curated or does not need curation');
    }

    const provider = await this.getProvider();
    const product = await this.getProductForCuration(productId);

    const results: CurationResult[] = [];

    // Determinar qué tipos de curación hacer
    const types: Array<'description' | 'seo' | 'validation'> = [];
    if (curationType === 'all') {
      if (config.enableDescription) types.push('description');
      if (config.enableSEO) types.push('seo');
      if (config.enableValidation) types.push('validation');
    } else {
      types.push(curationType as any);
    }

    // Ejecutar cada tipo de curación
    for (const type of types) {
      try {
        const result = await this.executeCuration(product, type, provider);
        results.push(result);
      } catch (error) {
        console.error(`Error curating ${type} for product ${productId}:`, error);
        results.push({
          productId,
          curationType: type,
          historyId: '',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: 0
        });
      }
    }

    // Actualizar estado del producto si es necesario
    if (results.some(r => r.status === 'pending_approval')) {
      await pool.query(`
        UPDATE products SET
          curation_status = 'ai_curated_pending',
          needs_review = true,
          ai_curated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [productId]);
    }

    return results;
  }

  /**
   * Curar múltiples productos (batch)
   */
  async curateProducts(
    productIds: string[],
    curationType: 'description' | 'seo' | 'validation' | 'all',
    userId?: string
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: CurationResult[];
  }> {
    const config = await this.getConfig();
    if (!config) {
      throw new Error('AI curation not configured');
    }

    // Limitar según configuración
    const limit = Math.min(productIds.length, config.maxProductsPerBatch);
    const productsToProcess = productIds.slice(0, limit);

    const allResults: CurationResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const productId of productsToProcess) {
      try {
        const results = await this.curateProduct(productId, curationType, userId);
        allResults.push(...results);

        if (results.every(r => r.status !== 'failed')) {
          successful++;
        } else {
          failed++;
        }

        // Pequeña pausa entre productos para no sobrecargar la API
        await this.sleep(500);
      } catch (error) {
        console.error(`Error curating product ${productId}:`, error);
        failed++;
        allResults.push({
          productId,
          curationType,
          historyId: '',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: 0
        });
      }
    }

    return {
      total: productsToProcess.length,
      successful,
      failed,
      results: allResults
    };
  }

  /**
   * Aprobar contenido generado por IA
   */
  async approveGeneratedContent(
    generatedContentId: string,
    approvedFields: string[],
    userId: string
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Obtener contenido generado
      const contentResult = await client.query(`
        SELECT
          gc.*,
          ah.product_id
        FROM ai_generated_content gc
        JOIN ai_curation_history ah ON gc.curation_history_id = ah.id
        WHERE gc.id = $1
      `, [generatedContentId]);

      if (contentResult.rows.length === 0) {
        throw new Error('Generated content not found');
      }

      const content = contentResult.rows[0];
      const productId = content.product_id;

      // Aplicar campos aprobados al producto
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCount = 1;

      if (approvedFields.includes('title') && content.generated_title) {
        updateFields.push(`name = $${paramCount++}`);
        updateValues.push(content.generated_title);
      }

      if (approvedFields.includes('short_description') && content.generated_short_description) {
        updateFields.push(`short_description = $${paramCount++}`);
        updateValues.push(content.generated_short_description);
      }

      if (approvedFields.includes('long_description') && content.generated_long_description) {
        updateFields.push(`long_description = $${paramCount++}`);
        updateValues.push(content.generated_long_description);
      }

      if (approvedFields.includes('seo_title') && content.generated_seo_title) {
        updateFields.push(`seo_title = $${paramCount++}`);
        updateValues.push(content.generated_seo_title);
      }

      if (approvedFields.includes('seo_description') && content.generated_seo_description) {
        updateFields.push(`seo_description = $${paramCount++}`);
        updateValues.push(content.generated_seo_description);
      }

      if (approvedFields.includes('seo_keywords') && content.generated_seo_keywords) {
        updateFields.push(`seo_keywords = $${paramCount++}`);
        updateValues.push(content.generated_seo_keywords);
      }

      if (approvedFields.includes('category') && content.suggested_category_id) {
        updateFields.push(`category_id = $${paramCount++}`);
        updateValues.push(content.suggested_category_id);
      }

      if (updateFields.length > 0) {
        updateFields.push(`curation_status = $${paramCount++}`);
        updateValues.push('ai_approved');

        updateFields.push(`ai_approved_at = CURRENT_TIMESTAMP`);
        updateFields.push(`ai_approved_by = $${paramCount++}`);
        updateValues.push(userId);

        updateFields.push(`needs_review = false`);
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

        updateValues.push(productId);

        await client.query(`
          UPDATE products SET ${updateFields.join(', ')}
          WHERE id = $${paramCount}
        `, updateValues);
      }

      // Actualizar estado del contenido generado
      await client.query(`
        UPDATE ai_generated_content SET
          approval_status = 'approved',
          approved_fields = $1
        WHERE id = $2
      `, [JSON.stringify(approvedFields), generatedContentId]);

      // Actualizar historial
      await client.query(`
        UPDATE ai_curation_history SET
          status = 'approved',
          reviewed_by = $1,
          reviewed_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [userId, content.curation_history_id]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Rechazar contenido generado por IA
   */
  async rejectGeneratedContent(
    generatedContentId: string,
    userId: string,
    notes?: string
  ): Promise<void> {
    await pool.query(`
      UPDATE ai_generated_content SET
        approval_status = 'rejected'
      WHERE id = $1
    `, [generatedContentId]);

    const content = await pool.query(`
      SELECT curation_history_id FROM ai_generated_content WHERE id = $1
    `, [generatedContentId]);

    if (content.rows.length > 0) {
      await pool.query(`
        UPDATE ai_curation_history SET
          status = 'rejected',
          reviewed_by = $1,
          reviewed_at = CURRENT_TIMESTAMP,
          review_notes = $2
        WHERE id = $3
      `, [userId, notes, content.rows[0].curation_history_id]);
    }
  }

  /**
   * Obtener productos que necesitan curación
   */
  async getProductsNeedingCuration(limit: number = 10): Promise<any[]> {
    const config = await this.getConfig();

    let curationStatusFilter = 'not_curated';

    if (config && config.skipIcecatCurated) {
      // Excluir productos con Icecat
      curationStatusFilter = 'not_curated';
    }

    const result = await pool.query(`
      SELECT * FROM get_products_needing_curation($1, $2)
    `, [limit, curationStatusFilter]);

    return result.rows;
  }

  /**
   * Obtener productos pendientes de aprobación
   */
  async getProductsPendingApproval(limit: number = 20): Promise<any[]> {
    const result = await pool.query(`
      SELECT
        p.id,
        p.sku,
        p.name,
        p.curation_status,
        p.ai_curated_at,
        gc.id as generated_content_id,
        gc.generated_title,
        gc.generated_short_description,
        gc.generated_seo_title,
        gc.approval_status,
        ah.curation_type,
        ah.ai_provider
      FROM products p
      JOIN ai_curation_history ah ON p.id = ah.product_id
      JOIN ai_generated_content gc ON ah.id = gc.curation_history_id
      WHERE p.curation_status = 'ai_curated_pending'
        AND gc.approval_status = 'pending'
        AND p.needs_review = true
      ORDER BY p.ai_curated_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  // Private helper methods

  private async shouldSkipProduct(productId: string, config: AIConfig): Promise<boolean> {
    if (!config.skipIcecatCurated) {
      return false;
    }

    // Verificar si el producto tiene datos de Icecat
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM icecat_product_mapping
      WHERE product_id = $1
    `, [productId]);

    return parseInt(result.rows[0].count) > 0;
  }

  private async getProductForCuration(productId: string): Promise<ProductCurationInput> {
    const result = await pool.query(`
      SELECT
        p.*,
        b.name as brand_name,
        c.name as category_name,
        (
          SELECT json_agg(json_build_object('key', spec_key, 'value', spec_value))
          FROM product_specifications
          WHERE product_id = p.id
        ) as specifications,
        (
          SELECT json_agg(url)
          FROM product_images
          WHERE product_id = p.id
          ORDER BY display_order
        ) as images
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1
    `, [productId]);

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    const row = result.rows[0];

    return {
      productId: row.id,
      sku: row.sku,
      name: row.name,
      shortDescription: row.short_description,
      longDescription: row.long_description,
      brand: row.brand_name,
      category: row.category_name,
      specifications: row.specifications || [],
      price: row.price,
      currency: row.currency,
      images: row.images || []
    };
  }

  private async executeCuration(
    product: ProductCurationInput,
    type: 'description' | 'seo' | 'validation',
    provider: AIProvider
  ): Promise<CurationResult> {
    const startTime = Date.now();
    const config = await this.getConfig();

    try {
      let result: any;
      let generatedContent: any = {};

      if (type === 'description') {
        result = await provider.generateProductDescription(product);
        generatedContent = {
          generated_short_description: result.data.shortDescription,
          generated_long_description: result.data.longDescription,
          generated_bullet_points: result.data.bulletPoints
        };
      } else if (type === 'seo') {
        result = await provider.generateSEO(product);
        generatedContent = {
          generated_seo_title: result.data.title,
          generated_seo_description: result.data.description,
          generated_seo_keywords: result.data.keywords
        };
      } else if (type === 'validation') {
        result = await provider.validateProduct(product);
        generatedContent = {
          validation_issues: result.data.issues
        };
      }

      const durationMs = Date.now() - startTime;

      // Guardar historial
      const historyResult = await pool.query(`
        INSERT INTO ai_curation_history (
          product_id,
          curation_type,
          ai_provider,
          ai_model,
          input_data,
          output_data,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          cost_usd,
          status,
          duration_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        product.productId,
        type,
        config?.activeProvider,
        result.model,
        JSON.stringify(product),
        JSON.stringify(result.data),
        result.promptTokens,
        result.completionTokens,
        result.totalTokens,
        result.costUSD,
        config?.requireManualApproval ? 'pending' : 'completed',
        durationMs
      ]);

      const historyId = historyResult.rows[0].id;

      // Guardar contenido generado si requiere aprobación
      let generatedContentId: string | undefined;

      if (config?.requireManualApproval && type !== 'validation') {
        const contentResult = await pool.query(`
          INSERT INTO ai_generated_content (
            product_id,
            curation_history_id,
            generated_short_description,
            generated_long_description,
            generated_seo_title,
            generated_seo_description,
            generated_seo_keywords,
            generated_bullet_points,
            approval_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
          RETURNING id
        `, [
          product.productId,
          historyId,
          generatedContent.generated_short_description,
          generatedContent.generated_long_description,
          generatedContent.generated_seo_title,
          generatedContent.generated_seo_description,
          generatedContent.generated_seo_keywords,
          generatedContent.generated_bullet_points,
        ]);

        generatedContentId = contentResult.rows[0].id;
      }

      return {
        productId: product.productId,
        curationType: type,
        historyId,
        generatedContentId,
        status: config?.requireManualApproval ? 'pending_approval' : 'completed',
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costUSD: result.costUSD,
        durationMs
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Guardar error en historial
      await pool.query(`
        INSERT INTO ai_curation_history (
          product_id,
          curation_type,
          ai_provider,
          status,
          error_message,
          duration_ms
        ) VALUES ($1, $2, $3, 'failed', $4, $5)
      `, [
        product.productId,
        type,
        config?.activeProvider,
        error instanceof Error ? error.message : 'Unknown error',
        durationMs
      ]);

      throw error;
    }
  }

  private encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new AICurationService();
