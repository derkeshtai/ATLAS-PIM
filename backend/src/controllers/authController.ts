import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import { generateToken } from '../middleware/auth';
import { createSuccessResponse, isValidEmail } from '../utils/helpers';
import { AppError } from '../middleware/errorHandler';
import { User } from '../models/Product';

export class AuthController {
  /**
   * POST /api/auth/register
   * Register new user
   */
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, full_name } = req.body;

      // Validate input
      if (!email || !password) {
        throw new AppError('Email and password are required', 400, 'MISSING_REQUIRED_FIELDS');
      }

      if (!isValidEmail(email)) {
        throw new AppError('Invalid email format', 400, 'INVALID_EMAIL');
      }

      if (password.length < 6) {
        throw new AppError('Password must be at least 6 characters', 400, 'WEAK_PASSWORD');
      }

      // Check if user already exists
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

      if (existingUser.rows.length > 0) {
        throw new AppError('User already exists', 409, 'USER_EXISTS');
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Create user
      const query = `
        INSERT INTO users (email, password_hash, full_name, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, full_name, role, created_at
      `;

      const result = await pool.query(query, [email, password_hash, full_name || null, 'user']);
      const user = result.rows[0];

      // Generate token
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(201).json(
        createSuccessResponse({
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
          },
          token,
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * User login
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        throw new AppError('Email and password are required', 400, 'MISSING_REQUIRED_FIELDS');
      }

      // Find user
      const query = 'SELECT * FROM users WHERE email = $1 AND is_active = true';
      const result = await pool.query(query, [email]);

      if (result.rows.length === 0) {
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      const user = result.rows[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      // Generate token
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      res.json(
        createSuccessResponse({
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
          },
          token,
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * Get current user profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      const query = 'SELECT id, email, full_name, role, created_at FROM users WHERE id = $1';
      const result = await pool.query(query, [userId]);

      if (result.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      res.json(createSuccessResponse(result.rows[0]));
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
