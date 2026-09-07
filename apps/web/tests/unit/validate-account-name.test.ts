import { describe, it, expect } from 'vitest';
import { validateAccountName, MAX_NAME_LENGTH } from '@/lib/account/validate-name';

describe('validateAccountName', () => {
  it('accepts a normal name', () => {
    expect(validateAccountName('Ada')).toEqual({ ok: true, name: 'Ada' });
  });

  it('trims surrounding whitespace', () => {
    expect(validateAccountName('  Ada  ')).toEqual({ ok: true, name: 'Ada' });
  });

  it('rejects an empty string', () => {
    expect(validateAccountName('')).toEqual({ ok: false, error: 'Name is required' });
  });

  it('rejects a whitespace-only name rather than storing blanks', () => {
    expect(validateAccountName('   ')).toEqual({ ok: false, error: 'Name is required' });
  });

  it('rejects a non-string', () => {
    expect(validateAccountName(42)).toEqual({ ok: false, error: 'Name is required' });
  });

  it('accepts a name of exactly the maximum length', () => {
    const name = 'a'.repeat(MAX_NAME_LENGTH);
    expect(validateAccountName(name)).toEqual({ ok: true, name });
  });

  it('rejects a name one character over the maximum', () => {
    expect(validateAccountName('a'.repeat(MAX_NAME_LENGTH + 1))).toEqual({
      ok: false,
      error: 'Name must be 50 characters or fewer',
    });
  });
});
