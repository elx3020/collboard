import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

/**
 * Shared chrome for every icon in this library.
 *
 * Icons are decorative by default (`aria-hidden`) because each icon-only
 * control in the app carries its own `aria-label`. Props spread last, so a
 * call site can override the size class, the stroke width, or `aria-hidden`
 * when an icon does need to be announced.
 */
export function StrokeIcon({ className = 'h-4 w-4', children, ...props }: IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...props}
        >
            {children}
        </svg>
    );
}

/** Solid counterpart to {@link StrokeIcon}, for glyphs drawn as filled shapes. */
export function FillIcon({ className = 'h-4 w-4', children, ...props }: IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            {...props}
        >
            {children}
        </svg>
    );
}
