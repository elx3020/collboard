/** Longest display name we store. Also the form input's `maxLength`. */
export const MAX_NAME_LENGTH = 50;

export type NameValidation =
  | { ok: true; name: string }
  | { ok: false; error: string };

/**
 * Validates a display name submitted to PATCH /api/user.
 *
 * Trimming lives here rather than at the call site so the route and the
 * settings form agree on what "empty" means — a name of only spaces is
 * rejected, not stored as blanks.
 */
export function validateAccountName(input: unknown): NameValidation {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Name is required' };
  }

  const name = input.trim();

  if (name.length === 0) {
    return { ok: false, error: 'Name is required' };
  }

  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` };
  }

  return { ok: true, name };
}
