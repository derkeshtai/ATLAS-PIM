import express from 'express';
import {
  getCronJobStatus,
  reloadCronJobs,
  runCronJobManually,
  stopCronJob,
  startCronJob,
  stopAllCronJobs
} from '../controllers/cronJobController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// All cron job routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

/**
 * @route   GET /api/v1/cron/status
 * @desc    Get status of all cron jobs
 * @access  Admin
 */
router.get('/status', getCronJobStatus);

/**
 * @route   POST /api/v1/cron/reload
 * @desc    Reload cron job configuration from database
 * @access  Admin
 */
router.post('/reload', reloadCronJobs);

/**
 * @route   POST /api/v1/cron/run/:jobName
 * @desc    Run a specific cron job manually
 * @access  Admin
 * @params  jobName - Name of the job (cva_inventory_sync, cva_price_sync, cva_product_discovery, ai_curation)
 */
router.post('/run/:jobName', runCronJobManually);

/**
 * @route   POST /api/v1/cron/stop/:jobName
 * @desc    Stop a specific cron job
 * @access  Admin
 */
router.post('/stop/:jobName', stopCronJob);

/**
 * @route   POST /api/v1/cron/start/:jobName
 * @desc    Start a specific cron job
 * @access  Admin
 */
router.post('/start/:jobName', startCronJob);

/**
 * @route   POST /api/v1/cron/stop-all
 * @desc    Stop all cron jobs
 * @access  Admin
 */
router.post('/stop-all', stopAllCronJobs);

export default router;
