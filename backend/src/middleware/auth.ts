import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createErrorResponse } from '../utils/helpers';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Verify JWT token from Authorization header
 */
export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(
        createErrorResponse('No token provided', 'AUTH_REQUIRED')
      );
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret) as {
      id: string;
      email: string;
      role: string;
    };

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json(
        createErrorResponse('Invalid token', 'INVALID_TOKEN')
      );
    } else if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json(
        createErrorResponse('Token expired', 'TOKEN_EXPIRED')
      );
    } else {
      res.status(500).json(
        createErrorResponse('Authentication error', 'AUTH_ERROR')
      );
    }
  }
}

/**
 * Verify user has required role
 */
export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(
        createErrorResponse('Authentication required', 'AUTH_REQUIRED')
      );
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json(
        createErrorResponse(
          'Insufficient permissions',
          'FORBIDDEN',
          { required: roles, current: req.user.role }
        )
      );
      return;
    }

    next();
  };
}

/**
 * Generate JWT token
 */
export function generateToken(payload: {
  id: string;
  email: string;
  role: string;
}): string {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(payload, secret, { expiresIn });
}
