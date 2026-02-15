'use client';

import { clsx } from 'clsx';
import Image from 'next/image';
import type { Priority } from '@/lib/types';

const priorityConfig: Record<Priority, { label: string; color: string; bgColor: string }> = {
    URGENT: { label: 'Urgent', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
    HIGH: { label: 'High', color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
    MEDIUM: { label: 'Medium', color: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
    LOW: { label: 'Low', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
    const config = priorityConfig[priority];
    return (
        <span
            className={clsx(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                config.bgColor,
                config.color
            )}
        >
            {config.label}
        </span>
    );
}

export function Avatar({
    src,
    name,
    size = 'sm',
}: {
    src?: string | null;
    name?: string | null;
    size?: 'sm' | 'md' | 'lg';
}) {
    const sizeClass = { sm: 'h-6 w-6 text-xs', md: 'h-8 w-8 text-sm', lg: 'h-10 w-10 text-base' }[size];
    const pixelSize = { sm: 24, md: 32, lg: 40 }[size];

    if (src) {
        return (
            <Image
                src={src}
                alt={name || ''}
                width={pixelSize}
                height={pixelSize}
                className={clsx('rounded-full ring-2 ring-[var(--border)] object-cover', sizeClass)}
            />
        );
    }

    return (
        <div
            className={clsx(
                'flex items-center justify-center rounded-full bg-[var(--accent)] font-medium text-white',
                sizeClass
            )}
        >
            {(name || '?')[0]?.toUpperCase()}
        </div>
    );
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizeClass = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' }[size];
    return (
        <svg
            className={clsx('animate-spin text-[var(--accent)]', sizeClass)}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
        </svg>
    );
}

export function EmptyState({
    icon,
    title,
    description,
    action,
}: {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            {icon && <div className="mb-4 text-[var(--muted-foreground)]">{icon}</div>}
            <h3 className="text-lg font-medium text-[var(--foreground)]">{title}</h3>
            {description && (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
