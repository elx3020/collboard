import { describe, it, expect } from 'vitest';
import { validatePasswordStrength } from '@/lib/auth/password';

describe('validatePasswordStrength', () => {
  it('accepts a strong password', () => {
    const result = validatePasswordStrength('StrongP@ss1');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = validatePasswordStrength('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Password must be at least 8 characters long'
    );
  });

  it('rejects a password without uppercase letters', () => {
    const result = validatePasswordStrength('lowercase1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Password must contain at least one uppercase letter'
    );
  });

  it('rejects a password without lowercase letters', () => {
    const result = validatePasswordStrength('UPPERCASE1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Password must contain at least one lowercase letter'
    );
  });

  it('rejects a password without numbers', () => {
    const result = validatePasswordStrength('NoNumbers!@');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Password must contain at least one number'
    );
  });

  it('rejects a password without special characters', () => {
    const result = validatePasswordStrength('NoSpecial1A');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Password must contain at least one special character'
    );
  });

  it('reports multiple errors at once', () => {
    const result = validatePasswordStrength('short');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
