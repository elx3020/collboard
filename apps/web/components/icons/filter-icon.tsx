import { StrokeIcon, type IconProps } from './icon';

export function FilterIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />
        </StrokeIcon>
    );
}
