import type { NextAuthOptions, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter } from 'next-auth/adapters';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { createRefreshToken, rotateRefreshToken } from '@/lib/auth/tokens';

/**
 * Extend NextAuth types to include custom fields
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
    accessToken?: string;
    error?: string;
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    refreshToken?: string;
    refreshTokenFamily?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}

/**
 * Access token lifetime in seconds (15 minutes)
 */
const ACCESS_TOKEN_MAX_AGE = 15 * 60;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  // Use JWT strategy for sessions (required for credentials provider)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  providers: [
    // GitHub OAuth Provider
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    }),

    // Google OAuth Provider
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),

    // Email/Password Credentials Provider
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error('Invalid email or password');
        }

        const isValid = await verifyPassword(
          credentials.password,
          user.password
        );

        if (!isValid) {
          throw new Error('Invalid email or password');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * JWT callback — called whenever a JWT is created or updated.
     * Handles refresh token creation and rotation.
     */
    async jwt({ token, user, account }): Promise<JWT> {
      // Initial sign-in: create a refresh token
      if (user && account) {
        const refreshTokenData = await createRefreshToken(user.id);

        return {
          ...token,
          id: user.id,
          email: user.email!,
          name: user.name,
          image: user.image,
          refreshToken: refreshTokenData.token,
          refreshTokenFamily: refreshTokenData.family,
          accessTokenExpires: Date.now() + ACCESS_TOKEN_MAX_AGE * 1000,
        };
      }

      // Return token if access token hasn't expired
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      // Access token has expired — rotate the refresh token
      if (token.refreshToken) {
        const rotated = await rotateRefreshToken(token.refreshToken);

        if (rotated) {
          return {
            ...token,
            refreshToken: rotated.token,
            refreshTokenFamily: rotated.family,
            accessTokenExpires: Date.now() + ACCESS_TOKEN_MAX_AGE * 1000,
            error: undefined,
          };
        }

        // Refresh token rotation failed — force re-authentication
        return {
          ...token,
          error: 'RefreshTokenError',
        };
      }

      return token;
    },

    /**
     * Session callback — controls what data is exposed to the client
     */
    async session({ session, token }): Promise<Session> {
      if (token) {
        session.user = {
          id: token.id,
          email: token.email,
          name: token.name,
          image: token.image,
        };
        session.error = token.error;
        // Expose the session token for WebSocket authentication
        session.accessToken = token.sub;
      }
      return session;
    },

    /**
     * Sign-in callback — additional validation before allowing sign-in
     */
    async signIn({ user, account }) {
      // Allow OAuth sign-in always
      if (account?.provider !== 'credentials') {
        return true;
      }

      // For credentials, ensure user exists and has an email
      if (!user?.email) {
        return false;
      }

      return true;
    },
  },

  events: {
    /**
     * When a user links a new OAuth account, log it
     */
    async linkAccount({ user }) {
      // Mark email as verified when linking an OAuth account
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    },
  },

  // Enable debug messages in development
  debug: process.env.NODE_ENV === 'development',

  // Secret for JWT encryption
  secret: process.env.NEXTAUTH_SECRET,
};
