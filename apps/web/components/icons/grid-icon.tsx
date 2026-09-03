import { StrokeIcon, type IconProps } from './icon';

/** The Collboard mark: four board tiles. Also the dashboard empty state. */
export function GridIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </StrokeIcon>
    );
}
