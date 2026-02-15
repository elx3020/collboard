import type {
  Board,
  Column,
  Task,
  Comment,
  BoardMember,
  CreateBoardRequest,
  UpdateBoardRequest,
  CreateColumnRequest,
  ReorderColumnsRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
  MoveTaskRequest,
  CreateCommentRequest,
  InviteMemberRequest,
} from '@/lib/types';

// ─── Generic Fetch Wrapper ─────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

// ─── Boards ────────────────────────────────────────────────────────────────────

export const boardsApi = {
  list: () => apiFetch<Board[]>('/api/boards'),

  get: (boardId: string) => apiFetch<Board>(`/api/boards/${boardId}`),

  create: (data: CreateBoardRequest) =>
    apiFetch<Board>('/api/boards', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (boardId: string, data: UpdateBoardRequest) =>
    apiFetch<Board>(`/api/boards/${boardId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (boardId: string) =>
    apiFetch<void>(`/api/boards/${boardId}`, { method: 'DELETE' }),
};

// ─── Columns ───────────────────────────────────────────────────────────────────

export const columnsApi = {
  list: (boardId: string) =>
    apiFetch<Column[]>(`/api/boards/${boardId}/columns`),

  create: (boardId: string, data: CreateColumnRequest) =>
    apiFetch<Column>(`/api/boards/${boardId}/columns`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (boardId: string, columnId: string, data: { title: string }) =>
    apiFetch<Column>(`/api/boards/${boardId}/columns/${columnId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (boardId: string, columnId: string) =>
    apiFetch<void>(`/api/boards/${boardId}/columns/${columnId}`, {
      method: 'DELETE',
    }),

  reorder: (boardId: string, data: ReorderColumnsRequest) =>
    apiFetch<Column[]>(`/api/boards/${boardId}/columns/reorder`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// ─── Tasks ─────────────────────────────────────────────────────────────────────

export const tasksApi = {
  list: (boardId: string) =>
    apiFetch<Task[]>(`/api/boards/${boardId}/tasks`),

  get: (boardId: string, taskId: string) =>
    apiFetch<Task>(`/api/boards/${boardId}/tasks/${taskId}`),

  create: (boardId: string, data: CreateTaskRequest) =>
    apiFetch<Task>(`/api/boards/${boardId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (boardId: string, taskId: string, data: UpdateTaskRequest) =>
    apiFetch<Task>(`/api/boards/${boardId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (boardId: string, taskId: string) =>
    apiFetch<void>(`/api/boards/${boardId}/tasks/${taskId}`, {
      method: 'DELETE',
    }),

  move: (boardId: string, taskId: string, data: MoveTaskRequest) =>
    apiFetch<Task>(`/api/boards/${boardId}/tasks/${taskId}/move`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// ─── Comments ──────────────────────────────────────────────────────────────────

export const commentsApi = {
  list: (boardId: string, taskId: string) =>
    apiFetch<Comment[]>(`/api/boards/${boardId}/tasks/${taskId}/comments`),

  create: (boardId: string, taskId: string, data: CreateCommentRequest) =>
    apiFetch<Comment>(`/api/boards/${boardId}/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (boardId: string, taskId: string, commentId: string) =>
    apiFetch<void>(
      `/api/boards/${boardId}/tasks/${taskId}/comments/${commentId}`,
      { method: 'DELETE' }
    ),
};

// ─── Members ───────────────────────────────────────────────────────────────────

export const membersApi = {
  list: (boardId: string) =>
    apiFetch<BoardMember[]>(`/api/boards/${boardId}/members`),

  invite: (boardId: string, data: InviteMemberRequest) =>
    apiFetch<BoardMember>(`/api/boards/${boardId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  remove: (boardId: string, memberId: string) =>
    apiFetch<void>(`/api/boards/${boardId}/members/${memberId}`, {
      method: 'DELETE',
    }),

  updateRole: (boardId: string, memberId: string, role: string) =>
    apiFetch<BoardMember>(`/api/boards/${boardId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
};
