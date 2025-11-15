import { Request, Response, NextFunction } from 'express';
import { createErrorResponse } from '../utils/helpers';

export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      createErrorResponse(err.message, err.code, err.details)
    );
    return;
  }

  // Database errors
  if (err.message.includes('duplicate key')) {
    res.status(409).json(
      createErrorResponse(
        'Resource already exists',
        'DUPLICATE_ENTRY',
        err.message
      )
    );
    return;
  }

  if (err.message.includes('foreign key')) {
    res.status(400).json(
      createErrorResponse(
        'Invalid reference',
        'FOREIGN_KEY_ERROR',
        err.message
      )
    );
    return;
  }

  // Default error
  res.status(500).json(
    createErrorResponse(
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? err.stack : undefined
    )
  );
}

export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.status(404).json(
    createErrorResponse(
      `Route ${req.method} ${req.url} not found`,
      'NOT_FOUND'
    )
  );
}
