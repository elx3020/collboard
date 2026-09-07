// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { Task, BoardMemberList } from '@/lib/types';

const updateMutate = vi.fn();

vi.mock('@/lib/hooks/use-queries', () => ({
    useComments: () => ({ data: [], isLoading: false }),
    useCreateComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteComment: () => ({ mutate: vi.fn() }),
    useUpdateTask: () => ({ mutate: updateMutate }),
    useDeleteTask: () => ({ mutateAsync: vi.fn() }),
    useMembers: () => ({ data: memberList, isLoading: false }),
}));

const memberList: BoardMemberList = {
    owner: {
        id: 'owner-1',
        userId: 'owner-1',
        name: 'Ada',
        email: 'ada@example.com',
        image: null,
        role: 'OWNER',
    },
    members: [],
};

const task: Task = {
    id: 'task-1',
    title: 'Ship the thing',
    description: 'A description',
    columnId: 'col-1',
    order: 0,
    assigneeId: null,
    priority: 'MEDIUM',
    status: 'INCOMPLETED',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    assignee: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

/** The modal focuses its first focusable element on open, on a 50ms timer. */
function settleAutoFocus() {
    act(() => {
        vi.advanceTimersByTime(100);
    });
}

describe('TaskDetailModal', () => {
    it('keeps focus in the title field while typing', async () => {
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={() => {}} task={task} boardId="board-1" />);
        settleAutoFocus();

        const title = screen.getByLabelText('Task title') as HTMLInputElement;
        title.focus();

        fireEvent.change(title, { target: { value: 'Ship the thingX' } });
        settleAutoFocus();

        expect(document.activeElement).toBe(title);
    });

    it('keeps focus in the description field while typing', async () => {
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={() => {}} task={task} boardId="board-1" />);
        settleAutoFocus();

        const description = screen.getByLabelText('Task description') as HTMLTextAreaElement;
        description.focus();

        fireEvent.change(description, { target: { value: 'A description!' } });
        settleAutoFocus();

        expect(document.activeElement).toBe(description);
    });

    it('still saves edited fields on close', async () => {
        const onClose = vi.fn();
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={onClose} task={task} boardId="board-1" />);
        settleAutoFocus();

        fireEvent.change(screen.getByLabelText('Task title'), {
            target: { value: 'Renamed task' },
        });
        fireEvent.click(screen.getByLabelText('Close'));

        expect(updateMutate).toHaveBeenCalledWith({
            taskId: 'task-1',
            data: { title: 'Renamed task' },
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape with the latest edits saved', async () => {
        const onClose = vi.fn();
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={onClose} task={task} boardId="board-1" />);
        settleAutoFocus();

        fireEvent.change(screen.getByLabelText('Task title'), {
            target: { value: 'Escaped rename' },
        });
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(updateMutate).toHaveBeenCalledWith({
            taskId: 'task-1',
            data: { title: 'Escaped rename' },
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('shows the current status as pressed', async () => {
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={() => {}} task={task} boardId="board-1" />);
        settleAutoFocus();

        expect(
            screen.getByRole('button', { name: 'Incompleted' }).getAttribute('aria-pressed')
        ).toBe('true');
        expect(
            screen.getByRole('button', { name: 'Completed' }).getAttribute('aria-pressed')
        ).toBe('false');
    });

    it('saves a status change on close', async () => {
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={() => {}} task={task} boardId="board-1" />);
        settleAutoFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
        fireEvent.click(screen.getByLabelText('Close'));

        expect(updateMutate).toHaveBeenCalledWith({
            taskId: 'task-1',
            data: { status: 'ARCHIVED' },
        });
    });

    it('does not re-save a status that was not changed', async () => {
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={() => {}} task={task} boardId="board-1" />);
        settleAutoFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Incompleted' }));
        fireEvent.click(screen.getByLabelText('Close'));

        expect(updateMutate).not.toHaveBeenCalled();
    });
});
