import { StrokeIcon, type IconProps } from './icon';

export function PlusIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </StrokeIcon>
    );
}
