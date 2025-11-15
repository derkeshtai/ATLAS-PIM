/**
 * Convert string to URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

/**
 * Generate unique SKU if not provided
 */
export function generateSKU(prefix: string = 'PROD'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
  const timestamp = Date.now();
  const sanitized = filename
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '-')
    .replace(/-+/g, '-');

  const parts = sanitized.split('.');
  const ext = parts.pop();
  const name = parts.join('.');

  return `${name}-${timestamp}.${ext}`;
}

/**
 * Format price for display
 */
export function formatPrice(price: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency,
  }).format(price);
}

/**
 * Pagination helper
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function getPaginationParams(page?: number, limit?: number) {
  const parsedPage = Math.max(1, page || 1);
  const parsedLimit = Math.min(100, Math.max(1, limit || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  return {
    page: parsedPage,
    limit: parsedLimit,
    offset,
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Error response helper
 */
export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export function createErrorResponse(
  message: string,
  code?: string,
  details?: any
): ApiError {
  return {
    message,
    code,
    details,
  };
}

/**
 * Success response helper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

export function createFailureResponse(error: ApiError): ApiResponse<never> {
  return {
    success: false,
    error,
  };
}
