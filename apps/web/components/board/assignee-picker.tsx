'use client';

import { useMembers } from '@/lib/hooks/use-queries';

/** Matches the compact priority select in the task detail modal. */
const COMPACT =
    'rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none';

export function AssigneePicker({
    boardId,
    value,
    onChange,
    disabled,
    className = COMPACT,
}: {
    boardId: string;
    value: string | null;
    onChange: (assigneeId: string | null) => void;
    disabled?: boolean;
    className?: string;
}) {
    const { data } = useMembers(boardId);

    // The owner arrives on its own key rather than inside `members`, so a plain
    // members.map() would leave the board owner — usually the person creating
    // the task — impossible to assign. Deduplicated by userId in case an owner
    // ever also holds a BoardMember row.
    const people = data
        ? [...new Map([data.owner, ...data.members].map((p) => [p.userId, p])).values()]
        : [];

    return (
        <select
            value={value ?? ''}
            aria-label="Assignee"
            disabled={disabled}
            // The empty option means unassigned; the API expects null for it,
            // and '' would be written as a user id.
            onChange={(e) => onChange(e.target.value || null)}
            className={className}
        >
            <option value="">Unassigned</option>
            {people.map((person) => (
                <option key={person.userId} value={person.userId}>
                    {person.name || person.email}
                </option>
            ))}
        </select>
    );
}
