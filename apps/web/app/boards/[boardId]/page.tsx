'use client';

import { useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Navbar } from '@/components/navbar';
import { BoardColumn } from '@/components/board/board-column';
import { TaskCardOverlay } from '@/components/board/task-card';
import { Spinner, EmptyState } from '@/components/ui-shared';
import {
  useBoard,
  useCreateColumn,
  useDeleteColumn,
  useUpdateColumn,
  useMoveTask,
} from '@/lib/hooks/use-queries';
import { useUIStore } from '@/lib/stores/ui-store';
import { useBoardRealtime, ConnectionStatus } from '@/lib/hooks/use-board-realtime';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/hooks/use-queries';
import type { Task, Column } from '@/lib/types';

// Lazy load heavy modals — only loaded when opened
const TaskDetailModal = lazy(() =>
  import('@/components/board/task-detail-modal').then((m) => ({ default: m.TaskDetailModal }))
);
const CreateTaskModal = lazy(() =>
  import('@/components/create-task-modal').then((m) => ({ default: m.CreateTaskModal }))
);

export default function BoardPage() {
  const params = useParams<{ boardId: string }>();
  const router = useRouter();
  const boardId = params.boardId;
  const queryClient = useQueryClient();

  const { data: board, isLoading, error } = useBoard(boardId);
  const createColumn = useCreateColumn(boardId);
  const deleteColumn = useDeleteColumn(boardId);
  const updateColumn = useUpdateColumn(boardId);
  const moveTask = useMoveTask(boardId);

  const {
    selectedTask,
    taskModalOpen,
    openTaskModal,
    closeTaskModal,
    createTaskModalOpen,
    createTaskColumnId,
    openCreateTaskModal,
    closeCreateTaskModal,
    searchQuery,
    priorityFilter,
  } = useUIStore();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');

  // Real-time: invalidate board query on incoming events
  useBoardRealtime(boardId, {
    onTaskMoved: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    },
    onCommentAdded: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    },
    onUserJoined: () => { },
    onUserLeft: () => { },
  });

  // Filter tasks based on search and priority
  const filteredColumns = useMemo(() => {
    if (!board?.columns) return [];
    return board.columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((task) => {
        const matchesSearch =
          !searchQuery ||
          task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesPriority = !priorityFilter || task.priority === priorityFilter;
        return matchesSearch && matchesPriority;
      }),
    }));
  }, [board?.columns, searchQuery, priorityFilter]);

  // DnD sensors — pointer with activation threshold + keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const taskData = active.data.current;
    if (taskData?.type === 'task') {
      setActiveTask(taskData.task as Task);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      if (!over || !board?.columns) return;

      const activeData = active.data.current;
      if (activeData?.type !== 'task') return;

      const draggedTask = activeData.task as Task;

      // Determine target column
      let targetColumnId: string;
      let targetOrder: number;

      const overData = over.data.current;

      if (overData?.type === 'column') {
        // Dropped on column directly (empty area)
        targetColumnId = (overData.column as Column).id;
        const column = board.columns.find((c) => c.id === targetColumnId);
        targetOrder = column?.tasks.length ?? 0;
      } else if (overData?.type === 'task') {
        // Dropped on another task
        const overTask = overData.task as Task;
        targetColumnId = overTask.columnId;
        const column = board.columns.find((c) => c.id === targetColumnId);
        const overIndex = column?.tasks.findIndex((t) => t.id === overTask.id) ?? 0;
        targetOrder = overIndex;
      } else {
        // Dropped on column droppable
        targetColumnId = over.id as string;
        const column = board.columns.find((c) => c.id === targetColumnId);
        targetOrder = column?.tasks.length ?? 0;
      }

      // Skip if position hasn't changed
      if (draggedTask.columnId === targetColumnId && draggedTask.order === targetOrder) {
        return;
      }

      moveTask.mutate({
        taskId: draggedTask.id,
        data: { columnId: targetColumnId, order: targetOrder },
      });
    },
    [board?.columns, moveTask]
  );

  const handleAddColumn = async () => {
    if (!newColumnTitle.trim()) return;
    await createColumn.mutateAsync({ title: newColumnTitle.trim() });
    setNewColumnTitle('');
    setAddingColumn(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <div className="mx-auto max-w-screen-xl px-4 py-16">
          <EmptyState
            title="Board not found"
            description={error?.message || 'This board may have been deleted.'}
            action={
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white hover:opacity-90"
              >
                Back to Dashboard
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <Navbar />

      {/* Board Header */}
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
              aria-label="Back to dashboard"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-[var(--foreground)]">
                {board.title}
              </h1>
              {board.description && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {board.description}
                </p>
              )}
            </div>
          </div>

          {/* Search + Filter + Status */}
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <div className="relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => useUIStore.getState().setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-48 rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                aria-label="Search tasks"
              />
            </div>
            <select
              value={priorityFilter || ''}
              onChange={(e) =>
                useUIStore.getState().setPriorityFilter(e.target.value || null)
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
              aria-label="Filter by priority"
            >
              <option value="">All priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Board Content */}
      <div className="flex-1 overflow-x-auto p-4 sm:p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 items-start">
            {filteredColumns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={column.tasks}
                onAddTask={openCreateTaskModal}
                onTaskClick={openTaskModal}
                onDeleteColumn={(colId) => deleteColumn.mutate(colId)}
                onRenameColumn={(colId, title) =>
                  updateColumn.mutate({ columnId: colId, title })
                }
              />
            ))}

            {/* Add Column */}
            <div className="w-72 flex-shrink-0">
              {addingColumn ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <input
                    autoFocus
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    placeholder="Column title..."
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddColumn();
                      if (e.key === 'Escape') {
                        setAddingColumn(false);
                        setNewColumnTitle('');
                      }
                    }}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={handleAddColumn}
                      disabled={createColumn.isPending}
                      className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setAddingColumn(false);
                        setNewColumnTitle('');
                      }}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingColumn(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Column
                </button>
              )}
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Task Detail Modal (lazy loaded) */}
      {selectedTask && (
        <Suspense fallback={null}>
          <TaskDetailModal
            open={taskModalOpen}
            onClose={closeTaskModal}
            task={selectedTask}
            boardId={boardId}
          />
        </Suspense>
      )}

      {/* Create Task Modal (lazy loaded) */}
      {createTaskColumnId && (
        <Suspense fallback={null}>
          <CreateTaskModal
            open={createTaskModalOpen}
            onClose={closeCreateTaskModal}
            boardId={boardId}
            columnId={createTaskColumnId}
          />
        </Suspense>
      )}
    </div>
  );
}
