'use client';

import { create } from 'zustand';
import type { Task } from '@/lib/types';

// ─── UI State Store ────────────────────────────────────────────────────────────

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Task detail modal
  selectedTask: Task | null;
  taskModalOpen: boolean;
  openTaskModal: (task: Task) => void;
  closeTaskModal: () => void;

  // Create board modal
  createBoardModalOpen: boolean;
  setCreateBoardModalOpen: (open: boolean) => void;

  // Create task modal
  createTaskModalOpen: boolean;
  createTaskColumnId: string | null;
  openCreateTaskModal: (columnId: string) => void;
  closeCreateTaskModal: () => void;

  // Search / filter
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  priorityFilter: string | null;
  setPriorityFilter: (priority: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Task detail
  selectedTask: null,
  taskModalOpen: false,
  openTaskModal: (task) => set({ selectedTask: task, taskModalOpen: true }),
  closeTaskModal: () => set({ selectedTask: null, taskModalOpen: false }),

  // Create board
  createBoardModalOpen: false,
  setCreateBoardModalOpen: (open) => set({ createBoardModalOpen: open }),

  // Create task
  createTaskModalOpen: false,
  createTaskColumnId: null,
  openCreateTaskModal: (columnId) =>
    set({ createTaskModalOpen: true, createTaskColumnId: columnId }),
  closeCreateTaskModal: () =>
    set({ createTaskModalOpen: false, createTaskColumnId: null }),

  // Search / filter
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  priorityFilter: null,
  setPriorityFilter: (priority) => set({ priorityFilter: priority }),
}));
