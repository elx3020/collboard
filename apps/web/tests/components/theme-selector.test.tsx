// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const setTheme = vi.fn();
let theme = 'system';

vi.mock('next-themes', () => ({
    useTheme: () => ({ theme, setTheme }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    theme = 'system';
});

describe('ThemeSelector', () => {
    it('offers System, Light and Dark', async () => {
        const { ThemeSelector } = await import('@/components/settings/theme-selector');
        render(<ThemeSelector />);

        expect(screen.getByRole('radio', { name: /system/i })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /light/i })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /dark/i })).toBeTruthy();
    });

    it('marks the active theme as checked', async () => {
        theme = 'dark';
        const { ThemeSelector } = await import('@/components/settings/theme-selector');
        render(<ThemeSelector />);

        expect(screen.getByRole('radio', { name: /dark/i })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'false');
    });

    it('sets the theme on click', async () => {
        const { ThemeSelector } = await import('@/components/settings/theme-selector');
        render(<ThemeSelector />);

        fireEvent.click(screen.getByRole('radio', { name: /light/i }));

        expect(setTheme).toHaveBeenCalledWith('light');
    });
});
