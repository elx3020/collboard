/**
 * Curated board colours.
 *
 * Each token maps to a CSS variable defined for BOTH themes in globals.css,
 * so a coloured board stays readable in light and dark. Free-form hex cannot
 * do this — one value cannot serve two backgrounds.
 *
 * Imported by the API route as well as client components: keep this file
 * free of React and of the 'use client' directive.
 */
export const BOARD_COLORS = ['amber', 'sky', 'emerald', 'rose', 'violet'] as const;

export type BoardColor = (typeof BOARD_COLORS)[number];

export const BOARD_COLOR_LABELS: Record<BoardColor, string> = {
    amber: 'Amber',
    sky: 'Sky',
    emerald: 'Emerald',
    rose: 'Rose',
    violet: 'Violet',
};

export function isBoardColor(value: unknown): value is BoardColor {
    return (
        typeof value === 'string' &&
        (BOARD_COLORS as readonly string[]).includes(value)
    );
}
