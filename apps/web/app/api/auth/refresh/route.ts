import { NextRequest, NextResponse } from 'next/server';
import { rotateRefreshToken } from '@/lib/auth/tokens';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/auth/refresh
 * Rotate a refresh token and return a new access/refresh token pair.
 *
 * This endpoint is used by clients that manage their own token storage
 * (e.g., mobile apps or SPAs not using NextAuth session cookies).
 *
 * Request body:
 *   { refreshToken: string }
 *
 * Response:
 *   { accessToken: string, refreshToken: string, expiresIn: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      );
    }

    // Attempt to rotate the refresh token
    const result = await rotateRefreshToken(refreshToken);

    if (!result) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token. Please sign in again.' },
        { status: 401 }
      );
    }

    // Get user details for the response
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { id: true, email: true, name: true, image: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user,
      refreshToken: result.token,
      expiresIn: 15 * 60, // 15 minutes in seconds
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
