/**
 * Icon library — one definition per glyph.
 *
 * Every icon takes the full set of `<svg>` props (`IconProps`) and applies them
 * last, so sizing, colour and stroke width stay with the call site while the
 * path data lives here exactly once. Import from `@/components/icons`; do not
 * inline an `<svg>` in a feature component.
 */
export { StrokeIcon, FillIcon, type IconProps } from './icon';

export { AlertTriangleIcon } from './alert-triangle-icon';
export { ChevronDownIcon } from './chevron-down-icon';
export { ChevronLeftIcon } from './chevron-left-icon';
export { CloseIcon } from './close-icon';
export { ColumnsIcon } from './columns-icon';
export { CommentIcon } from './comment-icon';
export { GitHubIcon } from './github-icon';
export { GoogleIcon } from './google-icon';
export { GridIcon } from './grid-icon';
export { MoonIcon } from './moon-icon';
export { MoreHorizontalIcon } from './more-horizontal-icon';
export { PlusIcon } from './plus-icon';
export { SearchIcon } from './search-icon';
export { SpinnerIcon } from './spinner-icon';
export { SunIcon } from './sun-icon';
export { TrashIcon } from './trash-icon';
export { UsersIcon } from './users-icon';
