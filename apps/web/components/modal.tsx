'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { CloseIcon } from '@/components/icons';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Trap focus and handle Escape
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }

            if (e.key === 'Tab' && contentRef.current) {
                const focusable = contentRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        e.preventDefault();
                        last?.focus();
                    }
                } else {
                    if (document.activeElement === last) {
                        e.preventDefault();
                        first?.focus();
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        // Focus first focusable element
        setTimeout(() => {
            const focusable = contentRef.current?.querySelector<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            focusable?.focus();
        }, 50);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    const sizeClass = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
    }[size];

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50  flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                ref={contentRef}
                className={clsx(
                    'w-full rounded-xl bg-[var(--card)] p-6 shadow-xl border border-[var(--border)] animate-in fade-in zoom-in-95',
                    sizeClass
                )}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-[var(--foreground)]">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
                        aria-label="Close"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
