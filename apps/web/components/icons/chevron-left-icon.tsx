import { StrokeIcon, type IconProps } from './icon';

export function ChevronLeftIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <polyline points="15 18 9 12 15 6" />
        </StrokeIcon>
    );
}
