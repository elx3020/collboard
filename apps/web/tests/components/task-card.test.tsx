// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Task, TaskStatus } from '@/lib/types';

// useSortable needs a DndContext ancestor; the card's drag behaviour is not
// what these tests are about, so it is stubbed out entirely.
vi.mock('@dnd-kit/sortable', () => ({
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: () => {},
        transform: null,
        transition: undefined,
        isDragging: false,
    }),
}));
vi.mock('@dnd-kit/utilities', () => ({
    CSS: { Transform: { toString: () => undefined } },
}));

const onClick = vi.fn();
const onToggleStatus = vi.fn();

function makeTask(status: TaskStatus): Task {
    return {
        id: 'task-1',
        title: 'Fix login',
        description: null,
        columnId: 'col-1',
        order: 0,
        assigneeId: null,
        priority: 'MEDIUM',
        status,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        assignee: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('TaskCard status toggle', () => {
    it('offers to complete an incompleted task', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('INCOMPLETED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        const toggle = screen.getByRole('button', { name: /mark as .*complete/i });
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
    });

    it('reports a completed task as pressed', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('COMPLETED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        expect(
            screen.getByRole('button', { name: /mark as .*complete/i }).getAttribute('aria-pressed')
        ).toBe('true');
    });

    it('toggles without opening the detail modal', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('INCOMPLETED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        fireEvent.click(screen.getByRole('button', { name: /mark as .*complete/i }));

        expect(onToggleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
        expect(onClick).not.toHaveBeenCalled();
    });

    it('shows an archived task as a non-interactive indicator', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('ARCHIVED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        expect(screen.queryByRole('button', { name: /mark as .*complete/i })).toBeNull();
        expect(screen.getByLabelText('Archived')).toBeTruthy();
    });

    it('strikes through the title of a completed task', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('COMPLETED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        expect(screen.getByText('Fix login').className).toContain('line-through');
    });
});
