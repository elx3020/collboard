'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { useSession } from 'next-auth/react';
import type { WsClientMessage, WsServerMessage, WsServerEventMap } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────────────

type EventCallback = (data: unknown) => void;

interface WebSocketContextType {
  isConnected: boolean;
  joinBoard: (boardId: string) => void;
  leaveBoard: (boardId: string) => void;
  on: <E extends string & keyof WsServerEventMap>(
    event: E,
    callback: (data: WsServerEventMap[E]) => void,
  ) => void;
  off: <E extends string & keyof WsServerEventMap>(
    event: E,
    callback?: (data: WsServerEventMap[E]) => void,
  ) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  joinBoard: () => { },
  leaveBoard: () => { },
  on: () => { },
  off: () => { },
});

export function useWebSocket() {
  return useContext(WebSocketContext);
}

// ─── Configuration ─────────────────────────────────────────────────────────────

const WS_PORT = process.env.NEXT_PUBLIC_WS_PORT || '3002';

const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 10_000;

// ─── Provider ──────────────────────────────────────────────────────────────────

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { data: session, status } = useSession();
  const [isConnected, setIsConnected] = useState(false);

  // Refs for stable state across re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const currentBoardRef = useRef<string | null>(null);
  const listenersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Internal helpers ──────────────────────────────────────────────────────

  const sendMessage = useCallback((msg: WsClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const dispatchEvent = useCallback((type: string, data: unknown) => {
    const cbs = listenersRef.current.get(type);
    if (cbs) {
      for (const cb of cbs) cb(data);
    }
  }, []);

  // ── Connection lifecycle ──────────────────────────────────────────────────

  const connectRef = useRef<(token: string) => void>(() => { });

  const scheduleReconnect = useCallback(
    (token: string) => {
      if (!mountedRef.current) return;
      if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max WebSocket reconnect attempts reached');
        return;
      }

      const delay = Math.min(
        INITIAL_RECONNECT_DELAY * 2 ** reconnectAttemptRef.current,
        MAX_RECONNECT_DELAY,
      );

      reconnectAttemptRef.current += 1;

      reconnectTimerRef.current = setTimeout(() => {
        console.log(`WebSocket reconnect attempt ${reconnectAttemptRef.current}`);
        connectRef.current(token);
      }, delay);
    },
    [connectRef],
  );


  const connect = useCallback(
    (token: string) => {
      if (!mountedRef.current) return;

      // Determine WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.hostname;
      const url = `${protocol}://${host}:${WS_PORT}?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        console.log('WebSocket connected');

        // Re-join current board on reconnect
        if (currentBoardRef.current) {
          sendMessage({ type: 'join:board', data: { boardId: currentBoardRef.current } });
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsServerMessage = JSON.parse(event.data);

          if (msg.type === 'pong') return; // heartbeat ack

          if ('data' in msg) {
            dispatchEvent(msg.type, msg.data);
          }
        } catch {
          console.error('Failed to parse WS message');
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        console.log('WebSocket disconnected:', event.code, event.reason);

        // Schedule reconnection unless it was a clean close
        if (event.code !== 1000) {
          scheduleReconnect(token);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this — reconnection handled there
      };
    },
    [sendMessage, dispatchEvent, scheduleReconnect],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);


  // ── Initialise/teardown ───────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      if (wsRef.current) {
        wsRef.current.close(1000, 'logout');
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    if (!session?.user?.id) return;

    let cancelled = false;

    const fetchTokenAndConnect = async () => {
      try {
        const res = await fetch('/api/auth/ws-token');
        if (!res.ok) return;
        const data = await res.json();
        const token = data.token as string | undefined;
        if (cancelled || !token) return;
        connect(token);
      } catch {
        console.error('Failed to fetch WebSocket auth token');
      }
    };

    fetchTokenAndConnect();

    return () => {
      cancelled = true;
      mountedRef.current = false;

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      if (wsRef.current) {
        wsRef.current.close(1000, 'cleanup');
        wsRef.current = null;
      }
    };
  }, [session, status, connect]);

  // ── Public API ────────────────────────────────────────────────────────────

  const joinBoard = useCallback(
    (boardId: string) => {
      currentBoardRef.current = boardId;
      sendMessage({ type: 'join:board', data: { boardId } });
      console.log(`Joining board: ${boardId}`);
    },
    [sendMessage],
  );

  const leaveBoard = useCallback(
    (boardId: string) => {
      if (currentBoardRef.current === boardId) {
        currentBoardRef.current = null;
      }
      sendMessage({ type: 'leave:board', data: { boardId } });
      console.log(`Leaving board: ${boardId}`);
    },
    [sendMessage],
  );

  const on = useCallback(
    <E extends string & keyof WsServerEventMap>(
      event: E,
      callback: (data: WsServerEventMap[E]) => void,
    ) => {
      if (!listenersRef.current.has(event)) {
        listenersRef.current.set(event, new Set());
      }
      listenersRef.current.get(event)!.add(callback as EventCallback);
    },
    [],
  );

  const off = useCallback(
    <E extends string & keyof WsServerEventMap>(
      event: E,
      callback?: (data: WsServerEventMap[E]) => void,
    ) => {
      if (!callback) {
        listenersRef.current.delete(event);
      } else {
        listenersRef.current.get(event)?.delete(callback as EventCallback);
      }
    },
    [],
  );

  const value: WebSocketContextType = {
    isConnected,
    joinBoard,
    leaveBoard,
    on,
    off,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
