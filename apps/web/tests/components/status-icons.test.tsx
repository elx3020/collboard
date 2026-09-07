// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CircleIcon, CheckCircleIcon, ArchiveIcon } from '@/components/icons';

describe('status icons', () => {
    it('renders each glyph as a decorative svg', () => {
        for (const Icon of [CircleIcon, CheckCircleIcon, ArchiveIcon]) {
            const { container, unmount } = render(<Icon />);
            const svg = container.querySelector('svg');
            expect(svg).not.toBeNull();
            expect(svg?.getAttribute('aria-hidden')).toBe('true');
            unmount();
        }
    });

    it('lets the call site own the size', () => {
        const { container } = render(<CheckCircleIcon className="h-3.5 w-3.5" />);
        expect(container.querySelector('svg')?.getAttribute('class')).toBe('h-3.5 w-3.5');
    });
});
