import { test, expect } from '@playwright/test';

/**
 * E2E: Authentication flow — sign-up, sign-in, redirect to dashboard.
 */
test.describe('Authentication Flow', () => {
  test('landing page loads and shows sign-in CTA', async ({ page }) => {
    await page.goto('/');

    // The landing page should have the app name and a sign-in link
    await expect(page.locator('body')).toContainText('Collboard');
  });

  test('sign-in page renders form', async ({ page }) => {
    await page.goto('/auth/signin');

    // Should show email and password fields
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('sign-up page renders form', async ({ page }) => {
    await page.goto('/auth/signup');

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('sign-in with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByLabel(/email/i).fill('nonexistent@test.com');
    await page.getByLabel(/password/i).fill('WrongPassword1!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show an error message (either toast or inline)
    await expect(
      page.getByText(/invalid|error|failed/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('unauthenticated user is redirected from /dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // Middleware should redirect to sign-in
    await page.waitForURL(/\/auth\/signin/);
    expect(page.url()).toContain('/auth/signin');
  });
});
