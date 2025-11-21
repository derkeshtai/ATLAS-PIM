import cron from 'node-cron';
import { cvaSyncService } from './cvaSyncService';
import { aiCurationService } from './aiCurationService';
import pool from '../config/database';

interface CronJobConfig {
  enabled: boolean;
  schedule: string;
  lastRun?: Date;
}

interface CronJobs {
  cvaSyncInventory: CronJobConfig;
  cvaSyncPrices: CronJobConfig;
  cvaSyncProducts: CronJobConfig;
  aiCuration: CronJobConfig;
}

class CronJobService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private isInitialized: boolean = false;

  /**
   * Initialize cron jobs from database configuration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Cron jobs already initialized');
      return;
    }

    console.log('Initializing cron jobs...');

    try {
      // Get CVA configuration
      const cvaConfig = await this.getCVAConfig();

      if (cvaConfig && cvaConfig.autoSyncEnabled) {
        // Schedule CVA inventory sync (hourly by default)
        if (cvaConfig.syncInventory) {
          const inventoryCron = cvaConfig.inventorySyncSchedule || '0 * * * *'; // Every hour at minute 0
          this.scheduleJob('cva_inventory_sync', inventoryCron, () => this.runCVAInventorySync());
          console.log(`Scheduled CVA inventory sync: ${inventoryCron}`);
        }

        // Schedule CVA price sync (every 6 hours by default)
        if (cvaConfig.syncPrices) {
          const priceCron = cvaConfig.priceSyncSchedule || '0 */6 * * *'; // Every 6 hours
          this.scheduleJob('cva_price_sync', priceCron, () => this.runCVAPriceSync());
          console.log(`Scheduled CVA price sync: ${priceCron}`);
        }

        // Schedule CVA product discovery (daily by default)
        if (cvaConfig.syncNewProducts) {
          const productCron = cvaConfig.productSyncSchedule || '0 2 * * *'; // Daily at 2 AM
          this.scheduleJob('cva_product_discovery', productCron, () => this.runCVAProductDiscovery());
          console.log(`Scheduled CVA product discovery: ${productCron}`);
        }
      }

      // Get AI Curation configuration
      const aiConfig = await this.getAICurationConfig();

      if (aiConfig && aiConfig.autoCurationEnabled) {
        const aiCron = aiConfig.autoCurationSchedule || '0 3 * * *'; // Daily at 3 AM
        this.scheduleJob('ai_curation', aiCron, () => this.runAICuration(aiConfig));
        console.log(`Scheduled AI curation: ${aiCron}`);
      }

      this.isInitialized = true;
      console.log('Cron jobs initialized successfully');
    } catch (error) {
      console.error('Error initializing cron jobs:', error);
      throw error;
    }
  }

  /**
   * Schedule a new cron job
   */
  private scheduleJob(name: string, schedule: string, task: () => Promise<void>): void {
    // Validate cron expression
    if (!cron.validate(schedule)) {
      console.error(`Invalid cron schedule for ${name}: ${schedule}`);
      return;
    }

    // Stop existing job if any
    if (this.jobs.has(name)) {
      this.jobs.get(name)?.stop();
    }

    // Schedule new job
    const job = cron.schedule(schedule, async () => {
      console.log(`Running scheduled task: ${name} at ${new Date().toISOString()}`);
      try {
        await task();
        await this.updateLastRun(name);
        console.log(`Completed scheduled task: ${name}`);
      } catch (error) {
        console.error(`Error in scheduled task ${name}:`, error);
        await this.logError(name, error);
      }
    }, {
      scheduled: true,
      timezone: process.env.CRON_TIMEZONE || 'America/Mexico_City'
    });

    this.jobs.set(name, job);
  }

  /**
   * Run CVA inventory sync
   */
  private async runCVAInventorySync(): Promise<void> {
    console.log('Starting CVA inventory sync...');

    try {
      const result = await cvaSyncService.syncInventory();
      console.log('CVA inventory sync completed:', result);
    } catch (error) {
      console.error('CVA inventory sync failed:', error);
      throw error;
    }
  }

  /**
   * Run CVA price sync
   */
  private async runCVAPriceSync(): Promise<void> {
    console.log('Starting CVA price sync...');

    try {
      const result = await cvaSyncService.syncPrices();
      console.log('CVA price sync completed:', result);
    } catch (error) {
      console.error('CVA price sync failed:', error);
      throw error;
    }
  }

  /**
   * Run CVA product discovery
   */
  private async runCVAProductDiscovery(): Promise<void> {
    console.log('Starting CVA product discovery...');

    try {
      const result = await cvaSyncService.discoverNewProducts();
      console.log('CVA product discovery completed:', result);
    } catch (error) {
      console.error('CVA product discovery failed:', error);
      throw error;
    }
  }

  /**
   * Run AI curation
   */
  private async runAICuration(config: any): Promise<void> {
    console.log('Starting AI curation...');

    try {
      const batchSize = config.batchSize || 50;
      const result = await aiCurationService.curateProductsBatch(batchSize);
      console.log('AI curation completed:', result);
    } catch (error) {
      console.error('AI curation failed:', error);
      throw error;
    }
  }

  /**
   * Get CVA configuration from database
   */
  private async getCVAConfig(): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT
          account_number,
          auto_sync_enabled as "autoSyncEnabled",
          sync_inventory as "syncInventory",
          sync_prices as "syncPrices",
          sync_new_products as "syncNewProducts",
          sync_inventory_cron as "inventorySyncSchedule",
          sync_prices_cron as "priceSyncSchedule",
          sync_new_products_cron as "productSyncSchedule"
        FROM cva_config
        LIMIT 1
      `);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting CVA config:', error);
      return null;
    }
  }

  /**
   * Get AI Curation configuration from database
   */
  private async getAICurationConfig(): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT
          auto_curation_enabled as "autoCurationEnabled",
          auto_curation_schedule as "autoCurationSchedule",
          batch_size as "batchSize",
          skip_icecat_enriched as "skipIcecatEnriched",
          require_manual_approval as "requireManualApproval"
        FROM ai_curation_config
        WHERE id = 1
      `);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting AI config:', error);
      return null;
    }
  }

  /**
   * Update last run timestamp
   */
  private async updateLastRun(jobName: string): Promise<void> {
    try {
      const tableName = jobName.startsWith('cva_') ? 'cva_sync_history' : 'ai_curation_history';
      const syncType = jobName.replace('cva_', '').replace('ai_', '');

      await pool.query(`
        INSERT INTO ${tableName} (sync_type, status, started_at, completed_at)
        VALUES ($1, $2, NOW(), NOW())
      `, [syncType, 'completed']);
    } catch (error) {
      console.error(`Error updating last run for ${jobName}:`, error);
    }
  }

  /**
   * Log error to database
   */
  private async logError(jobName: string, error: any): Promise<void> {
    try {
      const tableName = jobName.startsWith('cva_') ? 'cva_sync_history' : 'ai_curation_history';
      const syncType = jobName.replace('cva_', '').replace('ai_', '');
      const errorMessage = error instanceof Error ? error.message : String(error);

      await pool.query(`
        INSERT INTO ${tableName} (sync_type, status, started_at, completed_at, error_message)
        VALUES ($1, $2, NOW(), NOW(), $3)
      `, [syncType, 'failed', errorMessage]);
    } catch (err) {
      console.error(`Error logging error for ${jobName}:`, err);
    }
  }

  /**
   * Stop all cron jobs
   */
  stopAll(): void {
    console.log('Stopping all cron jobs...');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`Stopped cron job: ${name}`);
    });
    this.jobs.clear();
    this.isInitialized = false;
  }

  /**
   * Stop specific cron job
   */
  stop(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
      console.log(`Stopped cron job: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Start specific cron job
   */
  start(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.start();
      console.log(`Started cron job: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Get status of all jobs
   */
  getStatus(): { name: string; running: boolean }[] {
    const status: { name: string; running: boolean }[] = [];
    this.jobs.forEach((job, name) => {
      status.push({
        name,
        running: true // node-cron doesn't expose running status easily
      });
    });
    return status;
  }

  /**
   * Reload configuration and reschedule jobs
   */
  async reload(): Promise<void> {
    console.log('Reloading cron jobs configuration...');
    this.stopAll();
    await this.initialize();
  }

  /**
   * Run a job manually (bypass schedule)
   */
  async runManually(jobName: string): Promise<any> {
    console.log(`Running job manually: ${jobName}`);

    switch (jobName) {
      case 'cva_inventory_sync':
        return await this.runCVAInventorySync();

      case 'cva_price_sync':
        return await this.runCVAPriceSync();

      case 'cva_product_discovery':
        return await this.runCVAProductDiscovery();

      case 'ai_curation':
        const aiConfig = await this.getAICurationConfig();
        return await this.runAICuration(aiConfig);

      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }
}

export const cronJobService = new CronJobService();
