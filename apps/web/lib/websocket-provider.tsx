'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinBoard: (boardId: string) => void;
  leaveBoard: (boardId: string) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback?: (...args: unknown[]) => void) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  socket: null,
  isConnected: false,
  joinBoard: () => { },
  leaveBoard: () => { },
  on: () => { },
  off: () => { },
});

export function useWebSocket() {
  return useContext(WebSocketContext);
}

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentBoardRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Initialize socket connection
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      // Clean up socket if user logs out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    if (!session?.user?.id) return;

    // Fetch session token from the server (httpOnly cookies can't be read client-side)
    const fetchWsToken = async (): Promise<string | null> => {
      try {
        const res = await fetch('/api/auth/ws-token');
        if (!res.ok) return null;
        const data = await res.json();
        return data.token ?? null;
      } catch {
        console.error('Failed to fetch WebSocket auth token');
        return null;
      }
    };

    let cancelled = false;

    fetchWsToken().then((token) => {
      if (cancelled || !token) {
        if (!cancelled && !token) {
          console.error('No session token found');
        }
        return;
      }

      // Create socket connection
      const socketInstance = io({
        auth: {
          token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      socketInstance.on('connect', () => {
        console.log('WebSocket connected');
        setIsConnected(true);

        // Rejoin current board if any
        if (currentBoardRef.current) {
          socketInstance.emit('join:board', currentBoardRef.current);
        }
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setIsConnected(false);
      });

      socketInstance.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        setIsConnected(false);
      });

      socketInstance.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      setSocket(socketInstance);
      socketRef.current = socketInstance;
    });

    // Cleanup on unmount
    const timeout = reconnectTimeoutRef.current;
    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [session, status]);

  const joinBoard = useCallback(
    (boardId: string) => {
      if (!socket) return;

      currentBoardRef.current = boardId;
      socket.emit('join:board', boardId);
      console.log(`Joining board: ${boardId}`);
    },
    [socket]
  );

  const leaveBoard = useCallback(
    (boardId: string) => {
      if (!socket) return;

      if (currentBoardRef.current === boardId) {
        currentBoardRef.current = null;
      }
      socket.emit('leave:board', boardId);
      console.log(`Leaving board: ${boardId}`);
    },
    [socket]
  );

  const on = useCallback(
    (event: string, callback: (...args: unknown[]) => void) => {
      if (!socket) return;
      socket.on(event, callback);
    },
    [socket]
  );

  const off = useCallback(
    (event: string, callback?: (...args: unknown[]) => void) => {
      if (!socket) return;
      if (callback) {
        socket.off(event, callback);
      } else {
        socket.off(event);
      }
    },
    [socket]
  );

  const value: WebSocketContextType = {
    socket,
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
