import { StrokeIcon, type IconProps } from './icon';

export function ChevronDownIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <polyline points="6 9 12 15 18 9" />
        </StrokeIcon>
    );
}
