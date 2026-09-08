/**
 * Grow a textarea to fit its content, so long text wraps into view instead of
 * scrolling inside a fixed box.
 *
 * The correction matters: `scrollHeight` measures the content box, but these
 * fields are `border-box` (Tailwind's default), so assigning it straight to
 * `height` sizes the *border* box to the content height and leaves the element
 * short by its own borders — clipping the descenders on the last line. Measured
 * while the height is `auto`, `offsetHeight - clientHeight` is exactly that
 * border height.
 */
export function fitToContent(el: HTMLTextAreaElement | null): void {
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}
