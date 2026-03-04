'use client';

import { useEffect } from 'react';
import { useWebSocket } from '../websocket-provider';
import {
  EventType,
  type TaskMovedPayload,
  type CommentAddedPayload,
  type UserPresencePayload,
} from '../types';

interface BoardRealtimeCallbacks {
  onTaskMoved?: (event: TaskMovedPayload) => void;
  onTaskCreated?: (task: Record<string, unknown>) => void;
  onTaskUpdated?: (task: Record<string, unknown>) => void;
  onTaskDeleted?: (taskId: string) => void;
  onCommentAdded?: (event: CommentAddedPayload) => void;
  onCommentUpdated?: (comment: Record<string, unknown>) => void;
  onCommentDeleted?: (commentId: string) => void;
  onUserJoined?: (event: UserPresencePayload) => void;
  onUserLeft?: (event: UserPresencePayload) => void;
}

/**
 * Hook for subscribing to real-time board events
 */
export function useBoardRealtime(boardId: string | null, callbacks: BoardRealtimeCallbacks) {
  const { isConnected, joinBoard, leaveBoard, on, off } = useWebSocket();

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
    if (!isConnected || !boardId) return;

    const cleanupFns: Array<() => void> = [];

    // Task moved
    if (callbacks.onTaskMoved) {
      const handler = callbacks.onTaskMoved;
      on(EventType.TASK_MOVED, handler);
      cleanupFns.push(() => off(EventType.TASK_MOVED, handler));
    }

    // Task created
    if (callbacks.onTaskCreated) {
      const cb = callbacks.onTaskCreated;
      const handler = (data: { task: Record<string, unknown> }) => cb(data.task);
      on(EventType.TASK_CREATED, handler);
      cleanupFns.push(() => off(EventType.TASK_CREATED, handler));
    }

    // Task updated
    if (callbacks.onTaskUpdated) {
      const cb = callbacks.onTaskUpdated;
      const handler = (data: { task: Record<string, unknown> }) => cb(data.task);
      on(EventType.TASK_UPDATED, handler);
      cleanupFns.push(() => off(EventType.TASK_UPDATED, handler));
    }

    // Task deleted
    if (callbacks.onTaskDeleted) {
      const cb = callbacks.onTaskDeleted;
      const handler = (data: { taskId: string }) => cb(data.taskId);
      on(EventType.TASK_DELETED, handler);
      cleanupFns.push(() => off(EventType.TASK_DELETED, handler));
    }

    // Comment added
    if (callbacks.onCommentAdded) {
      const handler = callbacks.onCommentAdded;
      on(EventType.COMMENT_ADDED, handler);
      cleanupFns.push(() => off(EventType.COMMENT_ADDED, handler));
    }

    // Comment updated
    if (callbacks.onCommentUpdated) {
      const cb = callbacks.onCommentUpdated;
      const handler = (data: { comment: Record<string, unknown> }) => cb(data.comment);
      on(EventType.COMMENT_UPDATED, handler);
      cleanupFns.push(() => off(EventType.COMMENT_UPDATED, handler));
    }

    // Comment deleted
    if (callbacks.onCommentDeleted) {
      const cb = callbacks.onCommentDeleted;
      const handler = (data: { commentId: string }) => cb(data.commentId);
      on(EventType.COMMENT_DELETED, handler);
      cleanupFns.push(() => off(EventType.COMMENT_DELETED, handler));
    }

    // User joined
    if (callbacks.onUserJoined) {
      const handler = callbacks.onUserJoined;
      on(EventType.USER_JOINED, handler);
      cleanupFns.push(() => off(EventType.USER_JOINED, handler));
    }

    // User left
    if (callbacks.onUserLeft) {
      const handler = callbacks.onUserLeft;
      on(EventType.USER_LEFT, handler);
      cleanupFns.push(() => off(EventType.USER_LEFT, handler));
    }

    // Cleanup event listeners
    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, [isConnected, boardId, callbacks, on, off]);
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
