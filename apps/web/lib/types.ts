// ─── Real-time Event Types ─────────────────────────────────────────────────────

/**
 * Event types for real-time updates (shared between server and client)
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

/**
 * Channel name helpers for Redis pub/sub
 */
export const CHANNELS = {
  BOARD: (boardId: string) => `board:${boardId}`,
  TASK_MOVED: (boardId: string) => `board:${boardId}:task-moved`,
  COMMENT_ADDED: (boardId: string) => `board:${boardId}:comment-added`,
  USER_PRESENCE: (boardId: string) => `board:${boardId}:presence`,
};

// ─── WebSocket Event Payload Types ─────────────────────────────────────────────

export interface TaskMovedPayload {
  task: Record<string, unknown>;
  oldColumnId: string;
  newColumnId: string;
  userId: string;
  timestamp: string;
}

export interface TaskCreatedPayload {
  task: Record<string, unknown>;
}

export interface TaskUpdatedPayload {
  task: Record<string, unknown>;
}

export interface TaskDeletedPayload {
  taskId: string;
}

export interface CommentAddedPayload {
  comment: Record<string, unknown>;
  taskId: string;
  timestamp: string;
}

export interface CommentUpdatedPayload {
  comment: Record<string, unknown>;
}

export interface CommentDeletedPayload {
  commentId: string;
}

export interface UserPresencePayload {
  userId: string;
  socketId?: string;
  timestamp: string;
}

/**
 * Maps each server-sent event type to its data payload.
 */
export interface WsServerEventMap {
  [EventType.TASK_MOVED]: TaskMovedPayload;
  [EventType.TASK_CREATED]: TaskCreatedPayload;
  [EventType.TASK_UPDATED]: TaskUpdatedPayload;
  [EventType.TASK_DELETED]: TaskDeletedPayload;
  [EventType.COMMENT_ADDED]: CommentAddedPayload;
  [EventType.COMMENT_UPDATED]: CommentUpdatedPayload;
  [EventType.COMMENT_DELETED]: CommentDeletedPayload;
  [EventType.USER_JOINED]: UserPresencePayload;
  [EventType.USER_LEFT]: UserPresencePayload;
  error: { message: string };
}

// ─── WebSocket Message Types ───────────────────────────────────────────────────

/**
 * Messages sent from the client to the WS server
 */
export type WsClientMessage =
  | { type: 'join:board'; data: { boardId: string } }
  | { type: 'leave:board'; data: { boardId: string } }
  | { type: 'ping' };

/**
 * Messages sent from the WS server to the client
 */
export type WsServerMessage =
  | { [E in keyof WsServerEventMap]: { type: E; data: WsServerEventMap[E] } }[keyof WsServerEventMap]
  | { type: 'pong' };

// ─── Shared Types ──────────────────────────────────────────────────────────────

export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface Board {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: UserSummary;
  members: BoardMember[];
  columns: Column[];
  currentUserRole?: Role;
  _count?: { columns: number };
}

export interface BoardMember {
  id: string;
  boardId: string;
  userId: string;
  role: Role;
  user?: UserSummary;
  createdAt: string;
}

export interface Column {
  id: string;
  title: string;
  boardId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  _count?: { tasks: number };
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  columnId: string;
  order: number;
  assigneeId: string | null;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  assignee: UserSummary | null;
  column?: { id: string; title: string };
  comments?: Comment[];
  _count?: { comments: number };
}

export interface Comment {
  id: string;
  content: string;
  taskId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: UserSummary;
}

// ─── API Request Types ─────────────────────────────────────────────────────────

export interface CreateBoardRequest {
  title: string;
  description?: string;
}

export interface UpdateBoardRequest {
  title?: string;
  description?: string;
}

export interface CreateColumnRequest {
  title: string;
}

export interface ReorderColumnsRequest {
  columns: { id: string; order: number }[];
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  columnId: string;
  assigneeId?: string;
  priority?: Priority;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  assigneeId?: string | null;
  priority?: Priority;
}

export interface MoveTaskRequest {
  columnId: string;
  order: number;
}

export interface CreateCommentRequest {
  content: string;
}

export interface InviteMemberRequest {
  email: string;
  role?: 'EDITOR' | 'VIEWER';
}
