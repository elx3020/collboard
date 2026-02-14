import Link from 'next/link';

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🎉 WebSocket Integration Complete!
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            Real-time collaboration features powered by Socket.io and Redis pub/sub
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
              <span className="font-medium">Server Running</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-lg">
              <span className="font-medium">WebSocket Ready</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-800 rounded-lg">
              <span className="font-medium">Redis Connected</span>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Real-time Updates */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-3xl mb-3">⚡</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Real-time Updates
            </h2>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Task movements sync instantly across all users</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Comment additions appear in real-time</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Live user presence tracking</span>
              </li>
            </ul>
          </div>

          {/* Optimistic UI */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-3xl mb-3">🚀</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Optimistic UI
            </h2>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Immediate UI feedback on user actions</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Graceful error handling with rollback</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Smooth drag-and-drop experience</span>
              </li>
            </ul>
          </div>

          {/* Scalability */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-3xl mb-3">📈</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Scalable Architecture
            </h2>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Redis pub/sub for horizontal scaling</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Multiple server instances supported</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Room-based isolation per board</span>
              </li>
            </ul>
          </div>

          {/* Security */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-3xl mb-3">🔐</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Secure by Design
            </h2>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>JWT authentication for WebSocket</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Board-level access control</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Server-side event validation</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Technical Stack */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            🛠️ Technical Implementation
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Socket.io</h3>
              <p className="text-gray-600 text-sm">
                WebSocket server for bidirectional real-time communication with fallback to polling
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Redis Pub/Sub</h3>
              <p className="text-gray-600 text-sm">
                Message broadcasting across multiple server instances for horizontal scaling
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Custom Server</h3>
              <p className="text-gray-600 text-sm">
                Next.js integrated with Socket.io server using custom server.ts
              </p>
            </div>
          </div>
        </div>

        {/* Event Types */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            📡 Real-time Event Types
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <code className="text-sm font-mono text-purple-600">task:moved</code>
              <p className="text-sm text-gray-600 mt-1">When task is moved between columns</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <code className="text-sm font-mono text-purple-600">comment:added</code>
              <p className="text-sm text-gray-600 mt-1">When new comment is added to task</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <code className="text-sm font-mono text-purple-600">user:joined</code>
              <p className="text-sm text-gray-600 mt-1">When user joins the board</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <code className="text-sm font-mono text-purple-600">user:left</code>
              <p className="text-sm text-gray-600 mt-1">When user leaves the board</p>
            </div>
          </div>
        </div>

        {/* Code Example */}
        <div className="bg-gray-900 rounded-xl shadow-lg p-8 mb-8 overflow-x-auto">
          <h2 className="text-2xl font-bold text-white mb-4">
            💻 Usage Example
          </h2>
          <pre className="text-sm text-gray-100">
{`// Client-side hook
import { useBoardRealtime } from '@/lib/hooks/use-board-realtime';

export function BoardPage({ boardId }) {
  useBoardRealtime(boardId, {
    onTaskMoved: (event) => {
      // Update UI when task is moved by another user
      console.log('Task moved:', event);
    },
    onCommentAdded: (event) => {
      // Show new comment immediately
      console.log('New comment:', event.comment);
    },
    onUserJoined: (event) => {
      // Track online users
      console.log('User joined:', event.userId);
    },
  });
  
  return <div>Your board UI</div>;
}

// API route
import { publishEvent, CHANNELS, EventType } from '@/lib/redis';

// Emit event after updating data
await publishEvent(CHANNELS.BOARD(boardId), {
  type: EventType.TASK_MOVED,
  data: { task, oldColumnId, newColumnId },
});`}
          </pre>
        </div>

        {/* Documentation */}
        <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-purple-900 mb-4">
            📚 Documentation
          </h2>
          <p className="text-purple-800 mb-4">
            For detailed implementation guide, API reference, and troubleshooting:
          </p>
          <code className="block bg-white text-purple-900 px-4 py-3 rounded-lg font-mono text-sm">
            apps/web/WEBSOCKET.md
          </code>
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            🎯 Next Steps
          </h2>
          <ol className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <span className="font-bold mr-3 text-blue-600">1.</span>
              <span>
                <Link href="/auth/signin" className="text-blue-600 hover:underline font-medium">
                  Sign in
                </Link>
                {' '}to test the real-time features on actual board pages
              </span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3 text-blue-600">2.</span>
              <span>
                Open multiple browser windows to see real-time synchronization
              </span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3 text-blue-600">3.</span>
              <span>
                Check server console to see WebSocket connections and events
              </span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3 text-blue-600">4.</span>
              <span>
                Integrate <code className="bg-gray-100 px-2 py-1 rounded text-sm">useBoardRealtime</code> hook in your board components
              </span>
            </li>
          </ol>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600">
          <p className="mb-2">
            <Link href="/" className="text-blue-600 hover:underline">
              ← Back to Home
            </Link>
          </p>
          <p className="text-sm">
            Built with Next.js, Socket.io, Redis, and ❤️
          </p>
        </div>
      </div>
    </div>
  );
}
