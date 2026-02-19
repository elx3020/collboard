'use client';

import { useEffect } from 'react';
import { useWebSocket } from '../websocket-provider';

/**
 * Event types from the server
 */
export enum EventType {
  TASK_MOVED = 'task:moved',
  TASK_CREATED = 'task:created',
  TASK_UPDATED = 'task:updated',
  TASK_DELETED = 'task:deleted',
  COMMENT_ADDED = 'comment:added',
  COMMENT_UPDATED = 'comment:updated',
  COMMENT_DELETED = 'comment:deleted',
  USER_JOINED = 'user:joined',
  USER_LEFT = 'user:left',
}

interface TaskMovedEvent {
  task: Record<string, unknown>;
  oldColumnId: string;
  newColumnId: string;
  userId: string;
  timestamp: string;
}

interface CommentAddedEvent {
  comment: Record<string, unknown>;
  taskId: string;
  timestamp: string;
}

interface UserPresenceEvent {
  userId: string;
  socketId: string;
  timestamp: string;
}

interface BoardRealtimeCallbacks {
  onTaskMoved?: (event: TaskMovedEvent) => void;
  onTaskCreated?: (task: Record<string, unknown>) => void;
  onTaskUpdated?: (task: Record<string, unknown>) => void;
  onTaskDeleted?: (taskId: string) => void;
  onCommentAdded?: (event: CommentAddedEvent) => void;
  onCommentUpdated?: (comment: Record<string, unknown>) => void;
  onCommentDeleted?: (commentId: string) => void;
  onUserJoined?: (event: UserPresenceEvent) => void;
  onUserLeft?: (event: UserPresenceEvent) => void;
}

/**
 * Hook for subscribing to real-time board events
 */
export function useBoardRealtime(boardId: string | null, callbacks: BoardRealtimeCallbacks) {
  const { socket, isConnected, joinBoard, leaveBoard, on, off } = useWebSocket();

  // Join/leave board on mount/unmount
  useEffect(() => {
    if (!boardId || !isConnected) return;

    joinBoard(boardId);

    return () => {
      leaveBoard(boardId);
    };
  }, [boardId, isConnected, joinBoard, leaveBoard]);

  // Setup event listeners
  useEffect(() => {
    if (!socket || !boardId) return;

    const cleanupFns: Array<() => void> = [];

    // Task moved
    if (callbacks.onTaskMoved) {
      const handler = (data: TaskMovedEvent) => {
        callbacks.onTaskMoved?.(data);
      };
      on<TaskMovedEvent>(EventType.TASK_MOVED, handler);
      cleanupFns.push(() => off<TaskMovedEvent>(EventType.TASK_MOVED, handler));
    }

    // Task created
    if (callbacks.onTaskCreated) {
      const handler = (data: { task: Record<string, unknown> }) => {
        callbacks.onTaskCreated?.(data.task);
      };
      on<{ task: Record<string, unknown> }>(EventType.TASK_CREATED, handler);
      cleanupFns.push(() => off<{ task: Record<string, unknown> }>(EventType.TASK_CREATED, handler));
    }

    // Task updated
    if (callbacks.onTaskUpdated) {
      const handler = (data: { task: Record<string, unknown> }) => {
        callbacks.onTaskUpdated?.(data.task);
      };
      on<{ task: Record<string, unknown> }>(EventType.TASK_UPDATED, handler);
      cleanupFns.push(() => off<{ task: Record<string, unknown> }>(EventType.TASK_UPDATED, handler));
    }

    // Task deleted
    if (callbacks.onTaskDeleted) {
      const handler = (data: { taskId: string }) => {
        callbacks.onTaskDeleted?.(data.taskId);
      };
      on<{ taskId: string }>(EventType.TASK_DELETED, handler);
      cleanupFns.push(() => off<{ taskId: string }>(EventType.TASK_DELETED, handler));
    }

    // Comment added
    if (callbacks.onCommentAdded) {
      const handler = (data: CommentAddedEvent) => {
        callbacks.onCommentAdded?.(data);
      };
      on<CommentAddedEvent>(EventType.COMMENT_ADDED, handler);
      cleanupFns.push(() => off<CommentAddedEvent>(EventType.COMMENT_ADDED, handler));
    }

    // Comment updated
    if (callbacks.onCommentUpdated) {
      const handler = (data: { comment: Record<string, unknown> }) => {
        callbacks.onCommentUpdated?.(data.comment);
      };
      on<{ comment: Record<string, unknown> }>(EventType.COMMENT_UPDATED, handler);
      cleanupFns.push(() => off<{ comment: Record<string, unknown> }>(EventType.COMMENT_UPDATED, handler));
    }

    // Comment deleted
    if (callbacks.onCommentDeleted) {
      const handler = (data: { commentId: string }) => {
        callbacks.onCommentDeleted?.(data.commentId);
      };
      on<{ commentId: string }>(EventType.COMMENT_DELETED, handler);
      cleanupFns.push(() => off<{ commentId: string }>(EventType.COMMENT_DELETED, handler));
    }

    // User joined
    if (callbacks.onUserJoined) {
      const handler = (data: UserPresenceEvent) => {
        callbacks.onUserJoined?.(data);
      };
      on<UserPresenceEvent>(EventType.USER_JOINED, handler);
      cleanupFns.push(() => off<UserPresenceEvent>(EventType.USER_JOINED, handler));
    }

    // User left
    if (callbacks.onUserLeft) {
      const handler = (data: UserPresenceEvent) => {
        callbacks.onUserLeft?.(data);
      };
      on<UserPresenceEvent>(EventType.USER_LEFT, handler);
      cleanupFns.push(() => off<UserPresenceEvent>(EventType.USER_LEFT, handler));
    }

    // Cleanup event listeners
    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, [socket, boardId, callbacks, on, off]);
}

/**
 * Connection status indicator component
 */
export function ConnectionStatus() {
  const { isConnected } = useWebSocket();

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
        <span>Connected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
      <span>Disconnected</span>
    </div>
  );
}
