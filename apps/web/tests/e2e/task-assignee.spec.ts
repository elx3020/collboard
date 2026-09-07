import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: assigning a task to another member notifies them.
 *
 * Two accounts in two contexts. Board, column and task setup goes through the
 * API using each context's own session cookies — the point under test is the
 * assignment and the notice it produces, and clicking through setup would make
 * the test fragile for no extra coverage.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'CorrectHorse1!';

async function register(page: Page, email: string, name: string) {
  await page.goto('/auth/signup');
  await page.getByLabel(/name/i).fill(name);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel(/confirm password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();

  if (page.url().includes('/auth/signin')) {
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test('assigning a task to a member notifies them', async ({ browser }) => {
  const stamp = Date.now();
  const ownerEmail = `owner-${stamp}@example.com`;
  const memberEmail = `member-${stamp}@example.com`;

  const ownerCtx = await browser.newContext();
  const memberCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const member = await memberCtx.newPage();

  // The member must exist before they can be invited by email.
  await register(member, memberEmail, 'Grace');
  await register(owner, ownerEmail, 'Ada');

  // ── Setup via API, using the owner's session ──
  const board = await (
    await owner.request.post('/api/boards', { data: { title: `Roadmap ${stamp}` } })
  ).json();
  const column = await (
    await owner.request.post(`/api/boards/${board.id}/columns`, { data: { title: 'To Do' } })
  ).json();
  const invite = await owner.request.post(`/api/boards/${board.id}/members`, {
    data: { email: memberEmail, role: 'EDITOR' },
  });
  expect(invite.ok()).toBe(true);

  const task = await (
    await owner.request.post(`/api/boards/${board.id}/tasks`, {
      data: { title: `Fix login ${stamp}`, columnId: column.id },
    })
  ).json();
  expect(task.assigneeId).toBeNull(); // unassigned by default

  // ── Assign through the real UI ──
  await owner.goto(`/boards/${board.id}`);
  await owner.getByRole('button', { name: new RegExp(`Task: Fix login ${stamp}`) }).click();

  const picker = owner.getByLabel(/assignee/i);
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue('');

  // The owner and the invited member are both offered.
  await expect(picker.getByRole('option', { name: 'Ada' })).toHaveCount(1);
  await expect(picker.getByRole('option', { name: 'Grace' })).toHaveCount(1);

  const saved = owner.waitForResponse(
    (r) => r.url().includes(`/tasks/${task.id}`) && r.request().method() === 'PATCH' && r.ok(),
  );
  await picker.selectOption({ label: 'Grace' });
  await owner.keyboard.press('Escape'); // the detail modal saves on close
  await saved;

  // ── The member is notified ──
  await member.goto('/dashboard');
  await expect(member.getByRole('button', { name: /Notifications \(\d+ unread\)/ })).toBeVisible({
    timeout: 15_000,
  });
  await member.getByRole('button', { name: /Notifications/ }).click();
  await expect(member.getByText(new RegExp(`Ada assigned you to Fix login ${stamp}`))).toBeVisible({
    timeout: 15_000,
  });

  await ownerCtx.close();
  await memberCtx.close();
});
