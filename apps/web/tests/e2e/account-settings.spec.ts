import { test, expect } from '@playwright/test';

/**
 * E2E: the account lifecycle — register, rename, delete.
 *
 * Runs against a disposable account created inside the test, so exercising the
 * destructive path costs nothing. Serial because every step depends on the
 * account created in the first one.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Account settings', () => {
  const email = `settings-${Date.now()}@example.com`;
  const password = 'CorrectHorse1!';

  test('registers, renames, and deletes the account', async ({ page }) => {
    // ── Register ──
    await page.goto('/auth/signup');
    await page.getByLabel(/name/i).fill('Ada');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/dashboard|\/auth\/signin/, { timeout: 15_000 });

    // A fresh registration may drop the user at sign-in rather than straight
    // into the dashboard, depending on the auto-sign-in path.
    if (page.url().includes('/auth/signin')) {
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    }

    // ── Rename ──
    await page.goto('/settings/profile');
    const nameInput = page.getByLabel(/display name/i);
    await expect(nameInput).toHaveValue('Ada');
    await nameInput.fill('Ada Lovelace');
    await page.getByRole('button', { name: /^save$/i }).click();

    // The navbar reads the session, so this only passes if the JWT update
    // trigger refreshed the name.
    await expect(page.getByRole('button', { name: /account menu/i })).toContainText(
      'Ada Lovelace',
      { timeout: 15_000 },
    );

    // ── Delete ──
    await page.goto('/settings/account');
    await page.getByRole('button', { name: /^delete account$/i }).click();
    await page.getByLabel(/confirm your password/i).fill(password);
    await page.getByRole('button', { name: /delete my account/i }).click();

    await expect(page).toHaveURL('/', { timeout: 15_000 });

    // ── The credentials no longer work ──
    await page.goto('/auth/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid|error|failed/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the notification toggles persist across a reload', async ({ page }) => {
    const toggleEmail = `toggles-${Date.now()}@example.com`;

    await page.goto('/auth/signup');
    await page.getByLabel(/name/i).fill('Grace');
    await page.getByLabel(/email/i).fill(toggleEmail);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    if (page.url().includes('/auth/signin')) {
      await page.getByLabel(/email/i).fill(toggleEmail);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /sign in/i }).click();
    }
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto('/settings/notifications');
    const toggle = page.getByRole('switch', { name: /new tasks on your boards/i });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    // The switch updates optimistically, so aria-checked flips before the write
    // lands. Waiting on the response instead — reloading on the optimistic
    // state alone aborts the in-flight PUT and the preference is never saved.
    const saved = page.waitForResponse(
      (res) =>
        res.url().includes('/api/user/notification-preferences') &&
        res.request().method() === 'PUT' &&
        res.ok(),
    );

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await saved;

    await page.reload();
    await expect(
      page.getByRole('switch', { name: /new tasks on your boards/i }),
    ).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 });
  });
});
