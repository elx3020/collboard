import { describe, it, expect } from 'vitest';
import { formatNotification } from '@/lib/notifications/format';
import type { AppNotification, NotificationType } from '@/lib/types';

function make(
  type: NotificationType,
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: 'n-1',
    type,
    actorId: 'user-2',
    boardId: 'board-1',
    taskId: 'task-1',
    actorName: 'Ada',
    boardTitle: 'Roadmap',
    taskTitle: 'Fix login',
    meta: null,
    readAt: null,
    createdAt: '2026-09-03T12:00:00.000Z',
    actor: null,
    ...overrides,
  };
}

describe('formatNotification', () => {
  it('describes a task assignment', () => {
    expect(formatNotification(make('TASK_ASSIGNED'))).toBe('Ada assigned you to Fix login');
  });

  it('describes a comment', () => {
    expect(formatNotification(make('TASK_COMMENTED'))).toBe('Ada commented on Fix login');
  });

  it('describes a board invite', () => {
    expect(formatNotification(make('BOARD_INVITED'))).toBe('Ada added you to Roadmap');
  });

  it('describes a role change using meta.role', () => {
    const n = make('BOARD_ROLE_CHANGED', { meta: { role: 'EDITOR' } });
    expect(formatNotification(n)).toBe('Ada changed your role on Roadmap to EDITOR');
  });

  it('describes task creation and deletion', () => {
    expect(formatNotification(make('BOARD_TASK_ADDED'))).toBe('Ada created Fix login in Roadmap');
    expect(formatNotification(make('BOARD_TASK_REMOVED'))).toBe('Ada deleted Fix login in Roadmap');
  });

  it('falls back when the actor has been deleted', () => {
    const n = make('TASK_COMMENTED', { actorId: null, actorName: null });
    expect(formatNotification(n)).toBe('Someone commented on Fix login');
  });

  it('falls back when a snapshot title is missing', () => {
    const n = make('BOARD_TASK_ADDED', { taskTitle: null, boardTitle: null });
    expect(formatNotification(n)).toBe('Ada created a task in a board');
  });

  it('names the completion of a task', () => {
    expect(
      formatNotification(make('TASK_STATUS_CHANGED', { meta: { status: 'COMPLETED' } })),
    ).toBe('Ada completed Fix login');
  });

  it('calls a return to incompleted a reopen', () => {
    expect(
      formatNotification(make('TASK_STATUS_CHANGED', { meta: { status: 'INCOMPLETED' } })),
    ).toBe('Ada reopened Fix login');
  });

  it('names an archive', () => {
    expect(
      formatNotification(make('TASK_STATUS_CHANGED', { meta: { status: 'ARCHIVED' } })),
    ).toBe('Ada archived Fix login');
  });

  it('falls back to a generic phrase when meta is missing', () => {
    expect(formatNotification(make('TASK_STATUS_CHANGED', { meta: null }))).toBe(
      'Ada changed the status of Fix login',
    );
  });

  it('falls back for a deleted actor and task', () => {
    expect(
      formatNotification(
        make('TASK_STATUS_CHANGED', {
          actorName: null,
          taskTitle: null,
          meta: { status: 'COMPLETED' },
        }),
      ),
    ).toBe('Someone completed a task');
  });
});
