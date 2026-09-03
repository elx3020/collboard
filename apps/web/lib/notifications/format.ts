import type { AppNotification } from '@/lib/types';

/**
 * Builds a notification's display string from its type and snapshot columns.
 *
 * Never stored: rendering at display time keeps wording changeable without a
 * migration. Every field can be null — the subject may have been deleted, or
 * the actor's account removed — so each has a fallback.
 */
export function formatNotification(n: AppNotification): string {
  const actor = n.actorName ?? 'Someone';
  const task = n.taskTitle ?? 'a task';
  const board = n.boardTitle ?? 'a board';

  switch (n.type) {
    case 'TASK_ASSIGNED':
      return `${actor} assigned you to ${task}`;
    case 'TASK_COMMENTED':
      return `${actor} commented on ${task}`;
    case 'BOARD_INVITED':
      return `${actor} added you to ${board}`;
    case 'BOARD_ROLE_CHANGED':
      return `${actor} changed your role on ${board} to ${n.meta?.role ?? 'a new role'}`;
    case 'BOARD_TASK_ADDED':
      return `${actor} created ${task} in ${board}`;
    case 'BOARD_TASK_REMOVED':
      return `${actor} deleted ${task} in ${board}`;
  }
}
