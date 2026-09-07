// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { BoardMemberList } from '@/lib/types';

const onChange = vi.fn();
let memberList: BoardMemberList | undefined;

vi.mock('@/lib/hooks/use-queries', () => ({
    useMembers: () => ({ data: memberList, isLoading: false }),
}));

const list: BoardMemberList = {
    owner: {
        id: 'owner-1',
        userId: 'owner-1',
        name: 'Ada',
        email: 'ada@example.com',
        image: null,
        role: 'OWNER',
    },
    members: [
        {
            id: 'bm-1',
            userId: 'member-1',
            name: 'Grace',
            email: 'grace@example.com',
            image: null,
            role: 'EDITOR',
            joinedAt: '2026-09-01T00:00:00.000Z',
        },
        {
            id: 'bm-2',
            userId: 'member-2',
            name: null,
            email: 'alan@example.com',
            image: null,
            role: 'VIEWER',
            joinedAt: '2026-09-02T00:00:00.000Z',
        },
    ],
} as unknown as BoardMemberList;

beforeEach(() => {
    vi.clearAllMocks();
    memberList = list;
});

async function renderPicker(value: string | null = null) {
    const { AssigneePicker } = await import('@/components/board/assignee-picker');
    render(<AssigneePicker boardId="board-1" value={value} onChange={onChange} />);
    return screen.getByLabelText(/assignee/i) as HTMLSelectElement;
}

describe('AssigneePicker', () => {
    it('defaults to unassigned when no value is given', async () => {
        const select = await renderPicker(null);

        expect(select.value).toBe('');
        expect(screen.getByRole('option', { name: /unassigned/i })).toBeTruthy();
    });

    it('offers the board owner, who is not in the members array', async () => {
        await renderPicker();

        expect(screen.getByRole('option', { name: /ada/i })).toBeTruthy();
    });

    it('offers every member', async () => {
        await renderPicker();

        expect(screen.getByRole('option', { name: /grace/i })).toBeTruthy();
        expect(screen.getByRole('option', { name: /alan@example.com/i })).toBeTruthy();
    });

    it('offers a VIEWER too — being assigned needs no edit rights', async () => {
        await renderPicker();

        const alan = screen.getByRole('option', { name: /alan@example.com/i }) as HTMLOptionElement;
        expect(alan.disabled).toBe(false);
    });

    it('reflects the current assignee', async () => {
        const select = await renderPicker('member-1');

        expect(select.value).toBe('member-1');
    });

    it('emits the selected user id', async () => {
        const select = await renderPicker();

        fireEvent.change(select, { target: { value: 'member-1' } });

        expect(onChange).toHaveBeenCalledWith('member-1');
    });

    it('emits null when unassigned is chosen, not an empty string', async () => {
        const select = await renderPicker('member-1');

        fireEvent.change(select, { target: { value: '' } });

        expect(onChange).toHaveBeenCalledWith(null);
    });

    it('renders a usable control before the member list arrives', async () => {
        memberList = undefined;
        const select = await renderPicker();

        expect(select.value).toBe('');
        expect(screen.getByRole('option', { name: /unassigned/i })).toBeTruthy();
    });
});
