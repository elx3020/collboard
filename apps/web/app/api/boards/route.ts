import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';

/**
 * GET /api/boards
 * List all boards the authenticated user owns or is a member of.
 */
export const GET = withAuth(async (_req, { userId }) => {
  const boards = await prisma.board.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
    include: {
      owner: {
        select: { id: true, name: true, email: true, image: true },
      },
      members: {
        select: { userId: true, role: true },
      },
      _count: {
        select: { columns: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Attach the user's role to each board
  const boardsWithRole = boards.map((board) => {
    const role =
      board.ownerId === userId
        ? 'OWNER'
        : board.members.find((m) => m.userId === userId)?.role ?? 'VIEWER';
    return { ...board, currentUserRole: role };
  });

  return NextResponse.json(boardsWithRole);
});

/**
 * POST /api/boards
 * Create a new board. The creator becomes the owner.
 */
export const POST = withAuth(async (req, { userId }) => {
  const body = await req.json();
  const { title, description } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json(
      { error: 'Board title is required' },
      { status: 400 }
    );
  }

  const board = await prisma.board.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      ownerId: userId,
      // Create default columns for the new board
      columns: {
        create: [
          { title: 'To Do', order: 0 },
          { title: 'In Progress', order: 1 },
          { title: 'Done', order: 2 },
        ],
      },
    },
    include: {
      columns: { orderBy: { order: 'asc' } },
      owner: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  return NextResponse.json(board, { status: 201 });
});
