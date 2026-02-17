import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/ws-token
 *
 * Returns the raw NextAuth JWT session token for WebSocket authentication.
 * This endpoint exists because the session cookie is httpOnly and cannot be
 * read from client-side JavaScript via document.cookie.
 * The server reads the cookie from the request headers and returns the token.
 */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, raw: true });

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({ token });
  } catch (error) {
    console.error('Error fetching WS token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
