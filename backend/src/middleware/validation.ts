import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { createErrorResponse } from '../utils/helpers';

/**
 * Middleware to handle validation results
 */
export function validate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json(
      createErrorResponse(
        'Validation failed',
        'VALIDATION_ERROR',
        errors.array()
      )
    );
    return;
  }

  next();
}

/**
 * Wrapper to run validation chains
 */
export function runValidation(validations: ValidationChain[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const validation of validations) {
      const result = await validation.run(req);
      if (!result.isEmpty()) {
        break;
      }
    }
    validate(req, res, next);
  };
}
