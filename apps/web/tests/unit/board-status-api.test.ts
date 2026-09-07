import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boardsApi } from '@/lib/api';
import { queryKeys } from '@/lib/hooks/use-queries';
import { useUIStore } from '@/lib/stores/ui-store';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  useUIStore.setState({ statusFilter: 'ACTIVE' });
});

describe('boardsApi.get', () => {
  it('omits the query string for the default view', async () => {
    await boardsApi.get('board-1');
    expect(fetchMock).toHaveBeenCalledWith('/api/boards/board-1', expect.objectContaining({}));
  });

  it('passes an explicit status through', async () => {
    await boardsApi.get('board-1', 'ARCHIVED');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/boards/board-1?status=ARCHIVED',
      expect.objectContaining({}),
    );
  });
});

describe('queryKeys.boardFiltered', () => {
  it('extends the board key so existing invalidations still match', () => {
    expect(queryKeys.boardFiltered('board-1', 'ARCHIVED')).toEqual([
      ...queryKeys.board('board-1'),
      { status: 'ARCHIVED' },
    ]);
  });
});

describe('ui store status filter', () => {
  it('defaults to the active view', () => {
    expect(useUIStore.getState().statusFilter).toBe('ACTIVE');
  });

  it('records a new selection', () => {
    useUIStore.getState().setStatusFilter('COMPLETED');
    expect(useUIStore.getState().statusFilter).toBe('COMPLETED');
  });
});
