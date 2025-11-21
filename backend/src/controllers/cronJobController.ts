import { Request, Response } from 'express';
import { cronJobService } from '../services/cronJobService';

/**
 * Get status of all cron jobs
 */
export const getCronJobStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = cronJobService.getStatus();

    res.json({
      success: true,
      data: {
        jobs: status,
        totalJobs: status.length
      }
    });
  } catch (error) {
    console.error('Error getting cron job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cron job status'
    });
  }
};

/**
 * Reload cron job configuration
 */
export const reloadCronJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    await cronJobService.reload();

    res.json({
      success: true,
      message: 'Cron jobs reloaded successfully'
    });
  } catch (error) {
    console.error('Error reloading cron jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reload cron jobs'
    });
  }
};

/**
 * Run a cron job manually
 */
export const runCronJobManually = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobName } = req.params;

    if (!jobName) {
      res.status(400).json({
        success: false,
        error: 'Job name is required'
      });
      return;
    }

    const result = await cronJobService.runManually(jobName);

    res.json({
      success: true,
      message: `Job ${jobName} executed successfully`,
      data: result
    });
  } catch (error) {
    console.error('Error running cron job manually:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run cron job'
    });
  }
};

/**
 * Stop a specific cron job
 */
export const stopCronJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobName } = req.params;

    if (!jobName) {
      res.status(400).json({
        success: false,
        error: 'Job name is required'
      });
      return;
    }

    const stopped = cronJobService.stop(jobName);

    if (stopped) {
      res.json({
        success: true,
        message: `Job ${jobName} stopped successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Job ${jobName} not found`
      });
    }
  } catch (error) {
    console.error('Error stopping cron job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop cron job'
    });
  }
};

/**
 * Start a specific cron job
 */
export const startCronJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobName } = req.params;

    if (!jobName) {
      res.status(400).json({
        success: false,
        error: 'Job name is required'
      });
      return;
    }

    const started = cronJobService.start(jobName);

    if (started) {
      res.json({
        success: true,
        message: `Job ${jobName} started successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Job ${jobName} not found`
      });
    }
  } catch (error) {
    console.error('Error starting cron job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start cron job'
    });
  }
};

/**
 * Stop all cron jobs
 */
export const stopAllCronJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    cronJobService.stopAll();

    res.json({
      success: true,
      message: 'All cron jobs stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping all cron jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop all cron jobs'
    });
  }
};
