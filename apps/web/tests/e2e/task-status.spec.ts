import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/auth/password';

/**
 * E2E: a task's status from the card, through the filter, to the archive.
 *
 * The status is the one task field that changes without opening anything, so
 * this walks the card toggle, a reload, the header filter and the modal's
 * archive in one pass.
 */

const PASSWORD = 'CorrectHorse1!';

/**
 * Seeds the account instead of registering through the UI.
 *
 * POST /api/auth/register allows five requests per minute per IP, and the rest
 * of the e2e suite already spends that budget inside a single run. Signing in
 * is not rate limited, so creating the row directly keeps this spec off the
 * shared ceiling rather than pushing another test over it.
 */
async function signInAs(page: Page, email: string, name: string) {
  await prisma.user.create({
    data: { email, name, password: await hashPassword(PASSWORD) },
  });

  await page.goto('/auth/signin');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test('completes, filters, and archives a task', async ({ page }) => {
  const stamp = Date.now();
  const title = `Status round trip ${stamp}`;

  await signInAs(page, `status-${stamp}@example.com`, 'Ada');

  // ── Setup via API, using the page's own session cookies ──
  const board = await (
    await page.request.post('/api/boards', { data: { title: `Roadmap ${stamp}` } })
  ).json();
  const column = await (
    await page.request.post(`/api/boards/${board.id}/columns`, { data: { title: 'To Do' } })
  ).json();
  const task = await (
    await page.request.post(`/api/boards/${board.id}/tasks`, {
      data: { title, columnId: column.id },
    })
  ).json();
  expect(task.status).toBe('INCOMPLETED'); // the default

  await page.goto(`/boards/${board.id}`);

  const card = page.getByRole('button', { name: new RegExp(`Task: ${title}`) });
  await expect(card).toBeVisible();

  // ── Complete it from the card ──
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/tasks/${task.id}`) && r.request().method() === 'PATCH' && r.ok(),
  );
  await card.getByRole('button', { name: 'Mark as completed' }).click();
  await saved;

  // Survives a reload, so it really was persisted.
  await page.reload();
  await expect(
    page
      .getByRole('button', { name: new RegExp(`Task: ${title}`) })
      .getByRole('button', { name: 'Mark as incompleted' }),
  ).toBeVisible();

  // ── Filter ──
  const statusFilter = page.getByLabel('Filter by status');
  await statusFilter.selectOption('INCOMPLETED');
  await expect(page.getByText(title)).toHaveCount(0);

  await statusFilter.selectOption('COMPLETED');
  await expect(page.getByText(title)).toBeVisible();

  // ── Archive from the modal ──
  await statusFilter.selectOption('ACTIVE');
  await page.getByRole('button', { name: new RegExp(`Task: ${title}`) }).click();

  const archived = page.waitForResponse(
    (r) => r.url().includes(`/tasks/${task.id}`) && r.request().method() === 'PATCH' && r.ok(),
  );
  await page.getByRole('button', { name: 'Archived' }).click();
  await page.getByLabel('Close').click(); // the detail modal saves on close
  await archived;

  // Gone from the default view, present under the archived filter.
  await expect(page.getByText(title)).toHaveCount(0);
  await statusFilter.selectOption('ARCHIVED');
  await expect(page.getByText(title)).toBeVisible();
});
