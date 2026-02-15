'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { boardsApi, columnsApi, tasksApi, commentsApi, membersApi } from '@/lib/api';
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
import { toast } from 'sonner';

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const queryKeys = {
  boards: ['boards'] as const,
  board: (id: string) => ['boards', id] as const,
  columns: (boardId: string) => ['boards', boardId, 'columns'] as const,
  tasks: (boardId: string) => ['boards', boardId, 'tasks'] as const,
  task: (boardId: string, taskId: string) =>
    ['boards', boardId, 'tasks', taskId] as const,
  comments: (boardId: string, taskId: string) =>
    ['boards', boardId, 'tasks', taskId, 'comments'] as const,
  members: (boardId: string) => ['boards', boardId, 'members'] as const,
};

// ─── Boards ────────────────────────────────────────────────────────────────────

export function useBoards(options?: Partial<UseQueryOptions<Board[]>>) {
  return useQuery({
    queryKey: queryKeys.boards,
    queryFn: boardsApi.list,
    ...options,
  });
}

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: () => boardsApi.get(boardId),
    enabled: !!boardId,
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBoardRequest) => boardsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.boards });
      toast.success('Board created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateBoard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBoardRequest) => boardsApi.update(boardId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      qc.invalidateQueries({ queryKey: queryKeys.boards });
      toast.success('Board updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) => boardsApi.delete(boardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.boards });
      toast.success('Board deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Columns ───────────────────────────────────────────────────────────────────

export function useCreateColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateColumnRequest) => columnsApi.create(boardId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      toast.success('Column created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId, title }: { columnId: string; title: string }) =>
      columnsApi.update(boardId, columnId, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columnId: string) => columnsApi.delete(boardId, columnId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      toast.success('Column deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useReorderColumns(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReorderColumnsRequest) =>
      columnsApi.reorder(boardId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Tasks ─────────────────────────────────────────────────────────────────────

export function useCreateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskRequest) => tasksApi.create(boardId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      toast.success('Task created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string;
      data: UpdateTaskRequest;
    }) => tasksApi.update(boardId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      toast.success('Task updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.delete(boardId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      toast.success('Task deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMoveTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string;
      data: MoveTaskRequest;
    }) => tasksApi.move(boardId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Comments ──────────────────────────────────────────────────────────────────

export function useComments(boardId: string, taskId: string) {
  return useQuery({
    queryKey: queryKeys.comments(boardId, taskId),
    queryFn: () => commentsApi.list(boardId, taskId),
    enabled: !!boardId && !!taskId,
  });
}

export function useCreateComment(boardId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCommentRequest) =>
      commentsApi.create(boardId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.comments(boardId, taskId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      toast.success('Comment added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteComment(boardId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      commentsApi.delete(boardId, taskId, commentId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.comments(boardId, taskId),
      });
      toast.success('Comment deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Members ───────────────────────────────────────────────────────────────────

export function useMembers(boardId: string) {
  return useQuery({
    queryKey: queryKeys.members(boardId),
    queryFn: () => membersApi.list(boardId),
    enabled: !!boardId,
  });
}

export function useInviteMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteMemberRequest) =>
      membersApi.invite(boardId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members(boardId) });
      toast.success('Member invited');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRemoveMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => membersApi.remove(boardId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members(boardId) });
      toast.success('Member removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
