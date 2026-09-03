import { StrokeIcon, type IconProps } from './icon';

export function CloseIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </StrokeIcon>
    );
}
