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
