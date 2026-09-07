import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountApi } from '@/lib/api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
});

describe('accountApi', () => {
  it('fetches the profile', async () => {
    await accountApi.get();
    expect(fetchMock).toHaveBeenCalledWith('/api/user', expect.objectContaining({}));
  });

  it('PATCHes a name change', async () => {
    await accountApi.updateName({ name: 'Ada' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Ada' }) }),
    );
  });

  it('PUTs the whole muted array', async () => {
    await accountApi.updateNotificationPreferences({ mutedTypes: ['TASK_ASSIGNED'] });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user/notification-preferences',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ mutedTypes: ['TASK_ASSIGNED'] }),
      }),
    );
  });

  it('DELETEs with the confirmation in the body', async () => {
    await accountApi.remove({ password: 'CorrectHorse1!' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ password: 'CorrectHorse1!' }),
      }),
    );
  });

  it('surfaces the server error message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Confirmation failed' }),
    });

    await expect(accountApi.remove({ password: 'nope' })).rejects.toThrow('Confirmation failed');
  });
});
