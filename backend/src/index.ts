import express, { Application } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import imageRoutes from './routes/imageRoutes';
import importRoutes from './routes/importRoutes';
import exportRoutes from './routes/exportRoutes';
import cvaRoutes from './routes/cvaRoutes';
import aiCurationRoutes from './routes/aiCurationRoutes';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Import database
import pool from './config/database';

const app: Application = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
};
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Serve static files (uploaded images)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
const apiPrefix = `/api/${API_VERSION}`;

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/products`, productRoutes);
app.use(`${apiPrefix}/images`, imageRoutes);
app.use(`${apiPrefix}/import`, importRoutes);
app.use(`${apiPrefix}/export`, exportRoutes);
app.use(`${apiPrefix}/cva`, cvaRoutes);
app.use(`${apiPrefix}/ai`, aiCurationRoutes);

// Welcome route
app.get('/', (req, res) => {
  res.json({
    name: 'ATLAS-PIM API',
    version: '1.0.0',
    description: 'Product Information Management System',
    endpoints: {
      health: '/health',
      auth: `${apiPrefix}/auth`,
      products: `${apiPrefix}/products`,
      images: `${apiPrefix}/images`,
      import: `${apiPrefix}/import`,
      export: `${apiPrefix}/export`,
      cva: `${apiPrefix}/cva`,
      ai: `${apiPrefix}/ai`,
    },
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✓ Database connection successful');

    app.listen(PORT, () => {
      console.log('═══════════════════════════════════════════════');
      console.log(`  ATLAS-PIM API Server`);
      console.log('═══════════════════════════════════════════════');
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Port: ${PORT}`);
      console.log(`  API Version: ${API_VERSION}`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`  API Base: http://localhost:${PORT}${apiPrefix}`);
      console.log('═══════════════════════════════════════════════');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Start the server
startServer();

export default app;
