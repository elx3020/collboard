import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';

/** How many member avatars the dashboard card shows before collapsing to "+N". */
const MEMBER_PREVIEW_LIMIT = 4;

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
      // Only fetch the current user's membership (not all members)
      members: {
        where: { userId },
        // `id` is the BoardMember row id, which DELETE /members/[memberId]
        // is keyed by — it is what lets a member leave the board.
        select: { id: true, userId: true, role: true },
        take: 1,
      },
      // Feeds the dashboard card's load bar. Archived tasks are left out so
      // the card agrees with the board page, which hides them by default.
      columns: {
        select: {
          id: true,
          title: true,
          _count: { select: { tasks: { where: { status: { not: 'ARCHIVED' } } } } },
        },
        orderBy: { order: 'asc' },
      },
      _count: {
        select: { columns: true, members: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // A second query rather than a nested include: `members` above is already
  // narrowed to the current user's own row, which the leave action needs.
  const previews = await prisma.boardMember.findMany({
    where: { boardId: { in: boards.map((b) => b.id) } },
    select: {
      boardId: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const previewByBoard = new Map<string, (typeof previews)[number]['user'][]>();
  for (const { boardId, user } of previews) {
    const seen = previewByBoard.get(boardId) ?? [];
    if (seen.length < MEMBER_PREVIEW_LIMIT) seen.push(user);
    previewByBoard.set(boardId, seen);
  }

  // Attach the user's role to each board
  const boardsWithRole = boards.map(({ columns, ...board }) => {
    const role =
      board.ownerId === userId
        ? 'OWNER'
        : board.members[0]?.role ?? 'VIEWER';
    return {
      ...board,
      currentUserRole: role,
      columnSummaries: columns.map((c) => ({
        id: c.id,
        title: c.title,
        taskCount: c._count.tasks,
      })),
      memberPreview: previewByBoard.get(board.id) ?? [],
    };
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
