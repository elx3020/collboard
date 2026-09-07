import { StrokeIcon, type IconProps } from './icon';

export function CircleIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <circle cx="12" cy="12" r="9" />
        </StrokeIcon>
    );
}
