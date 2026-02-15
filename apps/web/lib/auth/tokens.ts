import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import { decode } from 'next-auth/jwt';

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

/**
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  return randomBytes(64).toString('hex');
}

/**
 * Create a new refresh token for a user.
 * Each token belongs to a "family" for rotation detection.
 */
export async function createRefreshToken(
  userId: string,
  family?: string
): Promise<{ token: string; family: string }> {
  const token = generateToken();
  const tokenFamily = family ?? uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      family: tokenFamily,
      expiresAt,
    },
  });

  return { token, family: tokenFamily };
}

/**
 * Rotate a refresh token — issue a new one and revoke the old.
 * Implements refresh token rotation with reuse detection:
 * - If the token has already been used (revoked), revoke ALL tokens in the family
 *   (potential token theft detected).
 * - Otherwise, revoke the old token and issue a new one in the same family.
 */
export async function rotateRefreshToken(
  oldToken: string
): Promise<{ token: string; family: string; userId: string } | null> {
  const existingToken = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
  });

  if (!existingToken) {
    return null; // Token doesn't exist
  }

  // Check if token has expired
  if (existingToken.expiresAt < new Date()) {
    // Revoke the expired token
    await prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  // REUSE DETECTION: If token was already revoked, someone is using a stolen token.
  // Revoke the entire family to protect the user.
  if (existingToken.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { family: existingToken.family },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  // Revoke the old token
  await prisma.refreshToken.update({
    where: { id: existingToken.id },
    data: { revokedAt: new Date() },
  });

  // Issue a new token in the same family
  const newTokenData = await createRefreshToken(
    existingToken.userId,
    existingToken.family
  );

  return {
    token: newTokenData.token,
    family: newTokenData.family,
    userId: existingToken.userId,
  };
}

/**
 * Revoke all refresh tokens for a user (e.g., on logout from all devices)
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke a specific refresh token family (e.g., on single-device logout)
 */
export async function revokeTokenFamily(family: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      family,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

/**
 * Clean up expired and revoked refresh tokens (run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  });

  return result.count;
}

/**
 * Verify a JWT access token from NextAuth
 * Used for WebSocket authentication
 */
export async function verifyAuthToken(token: string): Promise<{ userId: string } | null> {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error('NEXTAUTH_SECRET is not set');
      return null;
    }

    const decoded = await decode({
      token,
      secret,
    });

    if (!decoded || !decoded.id) {
      return null;
    }

    return { userId: decoded.id as string };
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}
