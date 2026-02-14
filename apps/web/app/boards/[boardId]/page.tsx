'use client';

import { useState, useEffect } from 'react';
import { useBoardRealtime, ConnectionStatus } from '@/lib/hooks/use-board-realtime';

interface BoardPageProps {
  params: {
    boardId: string;
  };
}

export default function BoardPage({ params }: BoardPageProps) {
  const { boardId } = params;
  const [tasks, setTasks] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Subscribe to real-time events
  useBoardRealtime(boardId, {
    onTaskMoved: (event) => {
      console.log('Task moved:', event);
      // Update task position in local state
      setTasks((prev) =>
        prev.map((task) =>
          task.id === event.task.id
            ? { ...task, columnId: event.newColumnId }
            : task
        )
      );
    },
    onCommentAdded: (event) => {
      console.log('Comment added:', event);
      // Add comment to local state
      setComments((prev) => [...prev, event.comment]);
    },
    onUserJoined: (event) => {
      console.log('User joined:', event.userId);
      setOnlineUsers((prev) => new Set([...prev, event.userId]));
    },
    onUserLeft: (event) => {
      console.log('User left:', event.userId);
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(event.userId);
        return next;
      });
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with connection status */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Board</h1>
              <p className="text-gray-600 mt-1">Board ID: {boardId}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {onlineUsers.size} user{onlineUsers.size !== 1 ? 's' : ''} online
              </div>
              <ConnectionStatus />
            </div>
          </div>
        </div>

        {/* Info card about real-time features */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">
            🎉 Real-time Features Enabled
          </h2>
          <p className="text-blue-700 mb-4">
            This board now has real-time collaboration features powered by WebSockets, Socket.io, and Redis pub/sub!
          </p>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>See task movements in real-time when collaborators drag and drop tasks</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Receive instant notifications when new comments are added</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Track online presence - see who's currently viewing the board</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Optimistic UI updates for smooth user experience</span>
            </li>
          </ul>
        </div>

        {/* Implementation guide */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            How to Use Real-time Features
          </h2>
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 mb-4">
              The real-time system is already integrated! Here's what's happening:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>The <code className="bg-gray-100 px-2 py-1 rounded">useBoardRealtime</code> hook automatically connects to WebSocket when this page loads</li>
              <li>It joins the board room to receive updates for this specific board</li>
              <li>Event handlers update the local state when real-time events arrive</li>
              <li>API routes emit events via Redis pub/sub when data changes</li>
              <li>All connected users receive the updates instantly</li>
            </ol>
            
            <p className="text-gray-700 mt-4">
              <strong>Try it:</strong> Open this board in multiple browser windows or devices. 
              When you make changes in one window (like moving tasks or adding comments), 
              you'll see the changes reflected in all other windows immediately!
            </p>

            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="font-semibold text-gray-900 mb-2">Implementation Example:</p>
              <pre className="text-xs bg-gray-800 text-gray-100 p-3 rounded overflow-x-auto">
{`useBoardRealtime(boardId, {
  onTaskMoved: (event) => {
    // Update UI when task is moved
    setTasks(prev => /* update state */);
  },
  onCommentAdded: (event) => {
    // Show new comment immediately
    setComments(prev => [...prev, event.comment]);
  },
  onUserJoined: (event) => {
    // Track online users
    setOnlineUsers(prev => new Set([...prev, event.userId]));
  },
});`}
              </pre>
            </div>
          </div>
        </div>

        {/* Event log for debugging */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Event Log
          </h2>
          <p className="text-gray-600 mb-4">
            Open the browser console to see real-time events as they arrive.
          </p>
          <div className="bg-gray-50 rounded p-4">
            <p className="text-sm text-gray-700 font-mono">
              Check console for event logs...
            </p>
          </div>
        </div>

        {/* API integration info */}
        <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            API Integration
          </h2>
          <p className="text-gray-700 mb-4">
            The following API routes have been updated to emit real-time events:
          </p>
          <ul className="space-y-2 text-gray-700">
            <li className="flex items-start">
              <code className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm mr-2">
                PATCH /api/boards/[boardId]/tasks/[taskId]/move
              </code>
              <span className="text-sm">Emits task:moved event</span>
            </li>
            <li className="flex items-start">
              <code className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm mr-2">
                POST /api/boards/[boardId]/tasks/[taskId]/comments
              </code>
              <span className="text-sm">Emits comment:added event</span>
            </li>
          </ul>
        </div>

        {/* Documentation link */}
        <div className="mt-6 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-purple-900 mb-2">
            📚 Documentation
          </h2>
          <p className="text-purple-700 mb-3">
            For detailed information about the WebSocket implementation, see the documentation:
          </p>
          <code className="text-sm bg-white text-purple-900 px-3 py-2 rounded block">
            apps/web/WEBSOCKET.md
          </code>
        </div>
      </div>
    </div>
  );
}
