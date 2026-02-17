import { describe, it, expect } from 'vitest';
import { hasRoleLevel, hasPermission, type Role } from '@/lib/auth/rbac';

describe('hasRoleLevel', () => {
  it('OWNER has level >= OWNER', () => {
    expect(hasRoleLevel('OWNER', 'OWNER')).toBe(true);
  });

  it('OWNER has level >= EDITOR', () => {
    expect(hasRoleLevel('OWNER', 'EDITOR')).toBe(true);
  });

  it('OWNER has level >= VIEWER', () => {
    expect(hasRoleLevel('OWNER', 'VIEWER')).toBe(true);
  });

  it('EDITOR has level >= EDITOR', () => {
    expect(hasRoleLevel('EDITOR', 'EDITOR')).toBe(true);
  });

  it('EDITOR does NOT have level >= OWNER', () => {
    expect(hasRoleLevel('EDITOR', 'OWNER')).toBe(false);
  });

  it('VIEWER does NOT have level >= EDITOR', () => {
    expect(hasRoleLevel('VIEWER', 'EDITOR')).toBe(false);
  });

  it('VIEWER has level >= VIEWER', () => {
    expect(hasRoleLevel('VIEWER', 'VIEWER')).toBe(true);
  });
});

describe('hasPermission', () => {
  const cases: Array<{ role: Role; permission: string; expected: boolean }> = [
    // OWNER can do everything
    { role: 'OWNER', permission: 'board:delete', expected: true },
    { role: 'OWNER', permission: 'board:edit', expected: true },
    { role: 'OWNER', permission: 'board:view', expected: true },
    { role: 'OWNER', permission: 'task:create', expected: true },

    // EDITOR can edit but not delete boards
    { role: 'EDITOR', permission: 'board:edit', expected: true },
    { role: 'EDITOR', permission: 'board:delete', expected: false },
    { role: 'EDITOR', permission: 'board:manage-members', expected: false },
    { role: 'EDITOR', permission: 'task:create', expected: true },
    { role: 'EDITOR', permission: 'task:move', expected: true },
    { role: 'EDITOR', permission: 'comment:delete-any', expected: true },

    // VIEWER can only view and comment
    { role: 'VIEWER', permission: 'board:view', expected: true },
    { role: 'VIEWER', permission: 'board:edit', expected: false },
    { role: 'VIEWER', permission: 'task:create', expected: false },
    { role: 'VIEWER', permission: 'comment:create', expected: true },
    { role: 'VIEWER', permission: 'comment:edit-own', expected: true },
    { role: 'VIEWER', permission: 'comment:delete-any', expected: false },
  ];

  for (const { role, permission, expected } of cases) {
    it(`${role} ${expected ? 'can' : 'cannot'} ${permission}`, () => {
      expect(hasPermission(role, permission as never)).toBe(expected);
    });
  }
});
