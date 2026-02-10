/**
 * Auth module barrel export
 *
 * Import from '@/lib/auth' for all authentication and authorization utilities.
 */

// Session management
export {
  getSession,
  getCurrentUser,
  requireAuth,
  unauthorizedResponse,
  forbiddenResponse,
  UnauthorizedError,
} from './session';

// Password utilities
export {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from './password';

// Role-based access control
export {
  PERMISSIONS,
  hasRoleLevel,
  hasPermission,
  getUserBoardRole,
  checkBoardPermission,
  requireBoardPermission,
  addBoardMember,
  updateBoardMemberRole,
  removeBoardMember,
  getBoardMembers,
  AuthorizationError,
} from './rbac';
export type { Permission } from './rbac';

// Token management
export {
  createRefreshToken,
  rotateRefreshToken,
  revokeAllUserTokens,
  revokeTokenFamily,
  cleanupExpiredTokens,
} from './tokens';

// API route guard
export { withAuth } from './api-guard';

// Auth configuration
export { authOptions } from './auth-options';
