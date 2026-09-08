'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { clsx } from 'clsx';
import { Modal } from '@/components/modal';
import { Avatar } from '@/components/ui-shared';
import { CloseIcon } from '@/components/icons';
import {
    useUpdateBoard,
    useMembers,
    useInviteMember,
    useRemoveMember,
} from '@/lib/hooks/use-queries';
import { fitToContent } from '@/lib/utils/fit-to-content';
import type { Board } from '@/lib/types';
import {
    BOARD_COLORS,
    BOARD_COLOR_LABELS,
    type BoardColor,
} from '@/lib/boards/board-colors';

/** The form is submitted from the footer, which sits outside it. */
const FORM_ID = 'board-settings-form';

/** Small uppercase field name, matching the task detail modal's rail. */
const FIELD_LABEL =
    'text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]';

const inputClass =
    'block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

/** Name and description sit flush on the surface — no box, no label, like the
 *  task detail modal's title and description. */
const FLUSH_FIELD =
    '-mx-2 resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]';

/** What each role can do, shown beside the invite field. */
const ROLE_NOTES: { role: string; can: string }[] = [
    { role: 'Viewer', can: 'reads the board and its tasks.' },
    { role: 'Editor', can: 'moves tasks and edits columns.' },
];

export function BoardSettingsModal({
    board,
    onClose,
}: {
    board: Board | null;
    onClose: () => void;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>('VIEWER');
    const [color, setColor] = useState<BoardColor | null>(null);
    const nameRef = useRef<HTMLTextAreaElement>(null);

    // Re-seed the form whenever a different board is opened.
    useEffect(() => {
        if (board) {
            setTitle(board.title);
            setDescription(board.description ?? '');
            setColor((board.color as BoardColor | null) ?? null);
        }
    }, [board]);

    // The name is a textarea, not an input, so a long board name wraps into the
    // heading instead of scrolling out of sight.
    useEffect(() => {
        fitToContent(nameRef.current);
    }, [title]);

    const boardId = board?.id ?? '';
    const updateBoard = useUpdateBoard(boardId);
    const { data: memberList } = useMembers(boardId);
    const members = memberList?.members;
    const inviteMember = useInviteMember(boardId);
    const removeMember = useRemoveMember(boardId);

    if (!board) return null;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        updateBoard.mutate(
            { title: title.trim(), description: description.trim(), color },
            { onSuccess: onClose }
        );
    };

    const handleInvite = () => {
        const email = inviteEmail.trim();
        if (!email) return;

        inviteMember.mutate(
            { email, role: inviteRole },
            { onSuccess: () => setInviteEmail('') }
        );
    };

    // The invite field sits outside the settings form, so Enter would otherwise
    // do nothing at all in it.
    const handleInviteKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        handleInvite();
    };

    const swatches: { value: BoardColor | null; label: string }[] = [
        { value: null, label: 'None' },
        ...BOARD_COLORS.map((c) => ({ value: c, label: BOARD_COLOR_LABELS[c] })),
    ];

    const memberCount = members?.length ?? board._count?.members ?? 0;

    return (
        <Modal open={!!board} onClose={onClose} title="Board Settings" size="xl" chrome={false}>
            <div className="flex h-[85vh] flex-col text-[var(--foreground)] lg:h-[min(38rem,85vh)]">
                {/* Where you are, rather than a repeated title — the heading is below. */}
                <header className="flex flex-none items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-3">
                    <nav
                        aria-label="Breadcrumb"
                        className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
                    >
                        <span className="hidden sm:inline">My boards</span>
                        <span aria-hidden="true" className="hidden sm:inline">
                            /
                        </span>
                        <span className="truncate">{board.title}</span>
                        <span aria-hidden="true">/</span>
                        <span className="flex-none text-[var(--foreground)]">Settings</span>
                    </nav>
                    <button
                        onClick={onClose}
                        className="flex-none rounded-lg p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                        aria-label="Close"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:overflow-visible">
                    {/* Name, description, colour */}
                    <form
                        id={FORM_ID}
                        onSubmit={handleSubmit}
                        className="flex min-h-0 flex-none flex-col border-b border-[var(--border)] px-7 py-6 lg:flex-1 lg:overflow-y-auto lg:border-b-0"
                    >
                        {/* The board's own name is the heading — the breadcrumb
                            already says this is Settings. */}
                        <textarea
                            ref={nameRef}
                            id="board-settings-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            rows={1}
                            required
                            aria-label="Board name"
                            className={clsx(
                                FLUSH_FIELD,
                                'flex-none overflow-hidden text-3xl font-bold leading-tight tracking-tight'
                            )}
                        />

                        <div className="mt-4 mb-3 h-px flex-none bg-[var(--border)]" />

                        <textarea
                            id="board-settings-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            placeholder="What's this board for?"
                            aria-label="Board description"
                            className={clsx(FLUSH_FIELD, 'min-h-28 flex-1 text-[15px] leading-relaxed')}
                        />

                        <div className="my-5 h-px flex-none bg-[var(--border)]" />

                        <span className={clsx(FIELD_LABEL, 'flex-none')}>Colour</span>
                        <div
                            role="group"
                            aria-label="Board colour"
                            className="mt-3 flex flex-none flex-wrap gap-2"
                        >
                            {swatches.map(({ value, label }) => {
                                const selected = color === value;
                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => setColor(value)}
                                        aria-label={label}
                                        aria-pressed={selected}
                                        className="w-14 text-left"
                                    >
                                        <span
                                            style={
                                                value
                                                    ? { background: `var(--board-${value})` }
                                                    : undefined
                                            }
                                            className={clsx(
                                                'block h-9 rounded-md border-2 transition-colors',
                                                !value && 'bg-[var(--card)]',
                                                selected
                                                    ? 'border-[var(--foreground)]'
                                                    : 'border-[var(--border)]'
                                            )}
                                        />
                                        <span
                                            className={clsx(
                                                'mt-1.5 block text-[11px]',
                                                selected
                                                    ? 'font-medium text-[var(--foreground)]'
                                                    : 'text-[var(--muted-foreground)]'
                                            )}
                                        >
                                            {label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </form>

                    {/* Members and board facts */}
                    <aside className="flex min-h-0 flex-none flex-col border-[var(--border)] px-6 py-6 lg:flex-1 lg:overflow-y-auto lg:border-l">
                        <span className={clsx(FIELD_LABEL, 'flex-none')}>Members</span>

                        {/* One row, as in the mock: address, role, then the action. */}
                        <div className="mt-3 flex flex-none items-stretch gap-1.5">
                            <input
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                onKeyDown={handleInviteKeyDown}
                                placeholder="teammate@example.com"
                                aria-label="Invite by email"
                                className={clsx(inputClass, 'min-w-0 flex-1 px-2 py-1.5 text-sm')}
                            />
                            <select
                                value={inviteRole}
                                onChange={(e) =>
                                    setInviteRole(e.target.value as 'EDITOR' | 'VIEWER')
                                }
                                aria-label="Member role"
                                className="w-auto flex-none rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-2 pr-6 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                            >
                                <option value="VIEWER">Viewer</option>
                                <option value="EDITOR">Editor</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleInvite}
                                disabled={inviteMember.isPending || !inviteEmail.trim()}
                                className="flex-none rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                {inviteMember.isPending ? '…' : 'Add'}
                            </button>
                        </div>

                        <div className="mt-4 min-h-0 flex-1 border-t border-[var(--border)] pt-3">
                            {memberCount === 0 ? (
                                <p className="text-sm text-[var(--muted-foreground)]">
                                    No members yet. Add someone by email above.
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {members?.map((member) => (
                                        <li
                                            key={member.id}
                                            className="flex items-center justify-between gap-2"
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                <Avatar
                                                    src={member.image}
                                                    name={member.name || member.email}
                                                    size="sm"
                                                />
                                                <span className="truncate text-sm">
                                                    {member.name || member.email}
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-2">
                                                <span className="text-xs text-[var(--muted-foreground)]">
                                                    {member.role}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeMember.mutate(member.id)}
                                                    className="rounded-lg p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--destructive)]"
                                                    aria-label={`Remove ${member.email}`}
                                                >
                                                    <CloseIcon className="h-4 w-4" />
                                                </button>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <dl className="mt-4 flex-none space-y-1.5 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
                            {ROLE_NOTES.map(({ role, can }) => (
                                <div key={role} className="flex gap-1.5">
                                    <dt className="font-semibold text-[var(--foreground)]">
                                        {role}
                                    </dt>
                                    <dd>— {can}</dd>
                                </div>
                            ))}
                        </dl>

                        <dl className="mt-4 flex-none space-y-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
                            <div className="flex justify-between">
                                <dt>Columns</dt>
                                <dd className="text-[var(--foreground)]">
                                    {board._count?.columns ?? board.columns?.length ?? 0}
                                </dd>
                            </div>
                            <div className="flex justify-between">
                                <dt>Members</dt>
                                <dd className="text-[var(--foreground)]">{memberCount}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt>Your role</dt>
                                <dd className="text-[var(--foreground)]">
                                    {board.currentUserRole ?? 'VIEWER'}
                                </dd>
                            </div>
                        </dl>
                    </aside>
                </div>

                <footer className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-3">
                    <span className="text-xs text-[var(--muted-foreground)]">
                        Changes apply to everyone on this board
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--muted)]"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            form={FORM_ID}
                            disabled={updateBoard.isPending || !title.trim()}
                            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            {updateBoard.isPending ? 'Saving...' : 'Save changes'}
                        </button>
                    </div>
                </footer>
            </div>
        </Modal>
    );
}
