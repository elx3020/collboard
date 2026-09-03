'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '../websocket-provider';
import { EventType } from '../types';
import { queryKeys } from './use-queries';

/**
 * Subscribes to the current user's notification stream.
 *
 * There is nothing to join: ws-server puts every authenticated socket in its
 * own user room at connection time, so this hook only listens. Like every
 * other real-time path in the app it invalidates rather than patching — the
 * feed refetches and stays the single source of truth.
 */
export function useUserRealtime() {
  const { isConnected, on, off } = useWebSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isConnected) return;

    const handler = () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications });
    };

    on(EventType.NOTIFICATION_CREATED, handler);
    return () => off(EventType.NOTIFICATION_CREATED, handler);
  }, [isConnected, on, off, qc]);
}
