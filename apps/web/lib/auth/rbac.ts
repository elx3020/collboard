import { prisma } from '@/lib/prisma';

/**
 * Role enum matching the Prisma schema.
 * Defined here to avoid import issues before Prisma client generation.
 */
export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';

/**
 * Role hierarchy: OWNER > EDITOR > VIEWER
 * Higher roles include all permissions of lower roles.
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

/**
 * Permission definitions mapped to minimum required role
 */
export const PERMISSIONS = {
  // Board permissions
  'board:view': 'VIEWER' as Role,
  'board:edit': 'EDITOR' as Role,
  'board:delete': 'OWNER' as Role,
  'board:manage-members': 'OWNER' as Role,

  // Column permissions
  'column:view': 'VIEWER' as Role,
  'column:create': 'EDITOR' as Role,
  'column:edit': 'EDITOR' as Role,
  'column:delete': 'EDITOR' as Role,
  'column:reorder': 'EDITOR' as Role,

  // Task permissions
  'task:view': 'VIEWER' as Role,
  'task:create': 'EDITOR' as Role,
  'task:edit': 'EDITOR' as Role,
  'task:delete': 'EDITOR' as Role,
  'task:move': 'EDITOR' as Role,
  'task:assign': 'EDITOR' as Role,

  // Comment permissions
  'comment:view': 'VIEWER' as Role,
  'comment:create': 'VIEWER' as Role, // Viewers can comment
  'comment:edit-own': 'VIEWER' as Role,
  'comment:delete-own': 'VIEWER' as Role,
  'comment:delete-any': 'EDITOR' as Role,
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Check if a role has sufficient privilege level
 */
export function hasRoleLevel(userRole: Role, requiredRole: Role): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(userRole: Role, permission: Permission): boolean {
  const requiredRole = PERMISSIONS[permission];
  return hasRoleLevel(userRole, requiredRole);
}

/**
 * Get the user's role on a specific board.
 * Returns the role if the user is a member or owner, null otherwise.
 *
 * Optimized: single query instead of two sequential lookups.
 */
export async function getUserBoardRole(
  userId: string,
  boardId: string
): Promise<Role | null> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      ownerId: true,
      members: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!board) return null;
  if (board.ownerId === userId) return 'OWNER';

  return (board.members[0]?.role as Role) ?? null;
}

/**
 * Check if a user has a specific permission on a board
 */
export async function checkBoardPermission(
  userId: string,
  boardId: string,
  permission: Permission
): Promise<boolean> {
  const role = await getUserBoardRole(userId, boardId);
  if (!role) return false;
  return hasPermission(role, permission);
}

/**
 * Require a specific permission on a board — throws if unauthorized.
 * Use in API routes for cleaner error handling.
 */
export async function requireBoardPermission(
  userId: string,
  boardId: string,
  permission: Permission
): Promise<Role> {
  const role = await getUserBoardRole(userId, boardId);

  if (!role) {
    throw new AuthorizationError(
      'You do not have access to this board',
      403
    );
  }

  if (!hasPermission(role, permission)) {
    throw new AuthorizationError(
      `Insufficient permissions. Required: ${PERMISSIONS[permission]}, your role: ${role}`,
      403
    );
  }

  return role;
}

/**
 * Add a member to a board with a specific role
 */
export async function addBoardMember(
  boardId: string,
  userId: string,
  role: Role = 'VIEWER'
) {
  return prisma.boardMember.upsert({
    where: {
      boardId_userId: { boardId, userId },
    },
    update: { role },
    create: { boardId, userId, role },
  });
}

/**
 * Update a board member's role
 */
export async function updateBoardMemberRole(
  boardId: string,
  userId: string,
  newRole: Role
) {
  return prisma.boardMember.update({
    where: {
      boardId_userId: { boardId, userId },
    },
    data: { role: newRole },
  });
}

/**
 * Remove a member from a board
 */
export async function removeBoardMember(boardId: string, userId: string) {
  return prisma.boardMember.delete({
    where: {
      boardId_userId: { boardId, userId },
    },
  });
}

/**
 * Get all members of a board with their roles
 */
export async function getBoardMembers(boardId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      ownerId: true,
      owner: {
        select: { id: true, name: true, email: true, image: true },
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
    },
  });

  if (!board) return null;

  return {
    owner: { ...board.owner, role: 'OWNER' as Role },
    members: board.members.map((m: { user: { id: string; name: string | null; email: string; image: string | null }; role: Role; createdAt: Date }) => ({
      ...m.user,
      role: m.role,
      joinedAt: m.createdAt,
    })),
  };
}

/**
 * Custom authorization error class
 */
export class AuthorizationError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
  }
}
