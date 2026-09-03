import { FillIcon, type IconProps } from './icon';

export function MoreHorizontalIcon(props: IconProps) {
    return (
        <FillIcon {...props}>
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
        </FillIcon>
    );
}
