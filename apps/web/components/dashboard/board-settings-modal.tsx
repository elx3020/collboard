'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/components/modal';
import { Avatar } from '@/components/ui-shared';
import {
    useUpdateBoard,
    useMembers,
    useInviteMember,
    useRemoveMember,
} from '@/lib/hooks/use-queries';
import type { Board } from '@/lib/types';

const inputClass =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

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

    // Re-seed the form whenever a different board is opened.
    useEffect(() => {
        if (board) {
            setTitle(board.title);
            setDescription(board.description ?? '');
        }
    }, [board]);

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
            { title: title.trim(), description: description.trim() },
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

    return (
        <Modal open={!!board} onClose={onClose} title="Board Settings">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label
                        htmlFor="board-settings-title"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        Name
                    </label>
                    <input
                        id="board-settings-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        className={inputClass}
                    />
                </div>

                <div>
                    <label
                        htmlFor="board-settings-description"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        Description
                    </label>
                    <textarea
                        id="board-settings-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="What's this board for?"
                        className={`${inputClass} resize-none`}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={updateBoard.isPending || !title.trim()}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {updateBoard.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>

            <div className="mt-6 border-t border-[var(--border)] pt-4">
                <h3 className="text-sm font-medium text-[var(--foreground)]">Members</h3>

                <div className="mt-2 flex gap-2">
                    <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="teammate@example.com"
                        aria-label="Invite by email"
                        className={`${inputClass} mt-0 flex-1`}
                    />
                    <select
                        value={inviteRole}
                        onChange={(e) =>
                            setInviteRole(e.target.value as 'EDITOR' | 'VIEWER')
                        }
                        aria-label="Member role"
                        className="mt-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                    >
                        <option value="VIEWER">Viewer</option>
                        <option value="EDITOR">Editor</option>
                    </select>
                    <button
                        type="button"
                        onClick={handleInvite}
                        disabled={inviteMember.isPending || !inviteEmail.trim()}
                        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {inviteMember.isPending ? 'Adding...' : 'Add'}
                    </button>
                </div>

                <ul className="mt-3 space-y-2">
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
                                <span className="truncate text-sm text-[var(--foreground)]">
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
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                        aria-hidden="true"
                                    >
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>

                {members && members.length === 0 && (
                    <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                        No members yet. Add someone by email above.
                    </p>
                )}
            </div>
        </Modal>
    );
}
