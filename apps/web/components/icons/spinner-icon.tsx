import type { IconProps } from './icon';

/**
 * Stands apart from {@link StrokeIcon}/{@link FillIcon}: the ring is stroked at
 * width 4 and the arc is filled, so neither shared base applies. Rotation and
 * colour come from the caller's `className` — see `Spinner` in `ui-shared`.
 */
export function SpinnerIcon({ className = 'h-4 w-4', ...props }: IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            {...props}
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
