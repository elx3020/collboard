import { test, expect } from '@playwright/test';

/**
 * E2E: Health check endpoint — verifies the API is operational.
 */
test.describe('API Health Check', () => {
  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get('/api/health');

    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
  });
});
