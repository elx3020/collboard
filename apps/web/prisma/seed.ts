/**
 * Local development seed — the demo workspace.
 *
 * Rebuilds the four demo accounts and the three boards they collaborate on,
 * so a wiped database (or a deleted Postgres volume) can be brought back to a
 * known, useful state with `npm run db:seed`.
 *
 * Idempotent: every row carries a fixed `seed-*` id, and the boards are dropped
 * and rebuilt on each run, so running it twice leaves the same state as running
 * it once. Accounts are matched on email, so a person who already exists —
 * david@email.com, say — keeps their real id and any boards of their own.
 *
 * This recreates the *demo*, not a byte-exact copy of whatever is in the
 * database today. For that, snapshot the volume instead: `npm run db:dump`.
 */
import { PrismaClient, type Priority, type TaskStatus, type Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

/**
 * Refuse to run anywhere but a local database.
 *
 * This file is local-only by three other means — it is absent from
 * `prisma.config.ts`, excluded by `.dockerignore`, and driven by an npm script
 * rather than `prisma db seed`. This is the last of them, and the only one that
 * still holds if someone runs the file directly with the wrong DATABASE_URL.
 */
function assertLocalDatabase(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL is not set.');

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production.');
  }

  // `postgres` and `db` are the usual compose service names, reachable only
  // from inside a local container network.
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at "${host}", which is not a local host. ` +
        'This seed writes demo accounts with a shared password and is for local development only.'
    );
  }
  return url;
}

const pool = new Pool({ connectionString: assertLocalDatabase(process.env.DATABASE_URL) });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Shared by every demo account. Local development only. */
const PASSWORD = 'Clave12345!';

const PEOPLE = {
  david: { id: 'seed-user-david', email: 'david@email.com', name: 'David' },
  mira: { id: 'seed-user-mira', email: 'mira@email.com', name: 'Mira Rossi' },
  jae: { id: 'seed-user-jae', email: 'jae@email.com', name: 'Jae Lim' },
  dana: { id: 'seed-user-dana', email: 'dana@email.com', name: 'Dana Okafor' },
} as const;

type PersonKey = keyof typeof PEOPLE;

/** Minutes ago, as a Date — keeps the activity feed reading as recent. */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

interface TaskSpec {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status?: TaskStatus;
  assignee?: PersonKey;
  comments?: { by: PersonKey; text: string; minutesAgo: number }[];
}

interface BoardSpec {
  id: string;
  title: string;
  description: string;
  owner: PersonKey;
  members: { who: PersonKey; role: Role }[];
  columns: { id: string; title: string; tasks: TaskSpec[] }[];
}

const BOARDS: BoardSpec[] = [
  {
    id: 'seed-board-relaunch',
    title: 'Website relaunch',
    description: 'Marketing site rebuild ahead of the Q3 pricing change.',
    owner: 'david',
    members: [
      { who: 'mira', role: 'EDITOR' },
      { who: 'jae', role: 'EDITOR' },
      { who: 'dana', role: 'VIEWER' },
    ],
    columns: [
      {
        id: 'seed-col-relaunch-todo',
        title: 'To Do',
        tasks: [
          {
            id: 'seed-task-pricing',
            title: 'Rewrite pricing page copy for Q3 launch',
            description:
              'The current page leads with feature counts. Lead with the outcome each tier buys instead, and cut the comparison table down to the four rows people actually scan.\n\nKeep the annual-billing toggle where it is — support tickets spike whenever it moves.',
            priority: 'HIGH',
            assignee: 'mira',
            comments: [
              {
                by: 'jae',
                minutesAgo: 220,
                text: 'Reads much tighter. One flag: we still say “unlimited” twice in the Team tier.',
              },
              {
                by: 'mira',
                minutesAgo: 180,
                text: 'Legal wants “unlimited” pulled entirely. They send approved wording Thursday.',
              },
              {
                by: 'dana',
                minutesAgo: 95,
                text: 'From support: the most common question is what happens when you go over the seat count. Worth answering on the page rather than in a doc.',
              },
              {
                by: 'david',
                minutesAgo: 40,
                text: 'Good catch — I will add an overages row once legal’s wording lands.',
              },
            ],
          },
          {
            id: 'seed-task-cta',
            title: 'Audit every call to action above the fold',
            description:
              'Six different phrasings for the same action across the site. Pick one verb and use it everywhere.',
            priority: 'MEDIUM',
            assignee: 'jae',
          },
          {
            id: 'seed-task-photos',
            title: 'Replace stock photography on the careers page',
            description: 'Waiting on the photographer to deliver the office set.',
            priority: 'LOW',
          },
        ],
      },
      {
        id: 'seed-col-relaunch-doing',
        title: 'In Progress',
        tasks: [
          {
            id: 'seed-task-nav',
            title: 'Rebuild the navigation for mobile',
            description:
              'The menu closes when you tap a submenu parent, so the second level is unreachable on a phone.',
            priority: 'URGENT',
            assignee: 'jae',
            comments: [
              {
                by: 'jae',
                minutesAgo: 300,
                text: 'Reproduced on iOS Safari and Chrome Android. The parent link fires navigation before the submenu opens.',
              },
              {
                by: 'david',
                minutesAgo: 260,
                text: 'That is the focus trap closing the panel. Fix is in the same component as the escape-key handler.',
              },
              {
                by: 'mira',
                minutesAgo: 150,
                text: 'Once it lands I will redraw the second level — it is too cramped at 375px.',
              },
            ],
          },
          {
            id: 'seed-task-cms',
            title: 'Migrate the blog to the new CMS schema',
            description:
              '208 posts. The importer handles everything except the pull-quote block, which needs a manual pass.',
            priority: 'HIGH',
            assignee: 'david',
            comments: [
              {
                by: 'david',
                minutesAgo: 70,
                text: 'Importer is done. Running it against a copy of production tonight.',
              },
            ],
          },
        ],
      },
      {
        id: 'seed-col-relaunch-review',
        title: 'In Review',
        tasks: [
          {
            id: 'seed-task-buttons',
            title: 'Consolidate the button components',
            description: 'Nine button variants collapsed to three: primary, secondary, quiet.',
            priority: 'MEDIUM',
            assignee: 'mira',
            comments: [
              {
                by: 'mira',
                minutesAgo: 400,
                text: 'Three variants cover every screen in the audit. The quiet one still needs a disabled state.',
              },
              {
                by: 'dana',
                minutesAgo: 120,
                text: 'Support portal uses the old ghost button in two places. Flagging so it does not get missed.',
              },
            ],
          },
          {
            id: 'seed-task-darkmode',
            title: 'Dark mode pass on the marketing pages',
            description: 'Contrast is under the AA floor on the testimonial cards and the footer.',
            priority: 'MEDIUM',
            assignee: 'david',
          },
        ],
      },
      {
        id: 'seed-col-relaunch-done',
        title: 'Done',
        tasks: [
          {
            id: 'seed-task-staging',
            title: 'Set up the staging environment',
            description:
              'Runs the production image against a seeded database, redeployed on every merge to main.',
            priority: 'HIGH',
            status: 'COMPLETED',
            assignee: 'david',
          },
          {
            id: 'seed-task-typescale',
            title: 'Pick the type scale',
            description: 'Settled on a 1.25 ratio from a 16px base.',
            priority: 'LOW',
            status: 'COMPLETED',
            assignee: 'mira',
          },
          {
            id: 'seed-task-abtest',
            title: 'Old homepage A/B test',
            description: 'Superseded by the relaunch — keeping the result for reference.',
            priority: 'LOW',
            status: 'ARCHIVED',
          },
        ],
      },
    ],
  },
  {
    id: 'seed-board-mobile',
    title: 'Mobile app v2',
    description: 'Offline-first rewrite of the task list.',
    owner: 'david',
    members: [{ who: 'jae', role: 'EDITOR' }],
    columns: [
      {
        id: 'seed-col-mobile-todo',
        title: 'To Do',
        tasks: [
          {
            id: 'seed-task-conflict',
            title: 'Design the offline conflict prompt',
            description: 'What a person sees when the same task changed on two devices.',
            priority: 'HIGH',
            assignee: 'jae',
          },
        ],
      },
      {
        id: 'seed-col-mobile-doing',
        title: 'In Progress',
        tasks: [
          {
            id: 'seed-task-cache',
            title: 'Local cache eviction policy',
            priority: 'MEDIUM',
            assignee: 'david',
          },
        ],
      },
      {
        id: 'seed-col-mobile-done',
        title: 'Done',
        tasks: [
          {
            id: 'seed-task-prototype',
            title: 'Ship the read-only prototype',
            priority: 'LOW',
            status: 'COMPLETED',
          },
        ],
      },
    ],
  },
  {
    // Owned by Mira on purpose: it puts a board in David's "Shared with me"
    // group, so the dashboard's three groupings are all exercised.
    id: 'seed-board-brand',
    title: 'Brand refresh',
    description: 'New wordmark and the type system that follows from it.',
    owner: 'mira',
    members: [
      { who: 'david', role: 'EDITOR' },
      { who: 'dana', role: 'VIEWER' },
    ],
    columns: [
      {
        id: 'seed-col-brand-todo',
        title: 'To Do',
        tasks: [
          {
            id: 'seed-task-licence',
            title: 'Licence the display face',
            priority: 'MEDIUM',
            assignee: 'mira',
          },
        ],
      },
      {
        id: 'seed-col-brand-doing',
        title: 'In Progress',
        tasks: [
          {
            id: 'seed-task-wordmark',
            title: 'Wordmark exploration, second round',
            description:
              'Three directions from the first round survived. Narrow to one before the type work starts.',
            priority: 'HIGH',
            assignee: 'david',
            comments: [
              {
                by: 'mira',
                minutesAgo: 200,
                text: 'Direction two reads best at small sizes, which is where the wordmark actually lives.',
              },
              {
                by: 'david',
                minutesAgo: 60,
                text: 'Agreed. I will set it against the new type scale and send a sheet tomorrow.',
              },
            ],
          },
        ],
      },
      { id: 'seed-col-brand-done', title: 'Done', tasks: [] },
    ],
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Accounts are matched on email so an existing person keeps their real id.
  const userId: Record<PersonKey, string> = {} as Record<PersonKey, string>;
  for (const [key, person] of Object.entries(PEOPLE) as [PersonKey, (typeof PEOPLE)[PersonKey]][]) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { name: person.name, password: passwordHash },
      create: {
        id: person.id,
        email: person.email,
        name: person.name,
        password: passwordHash,
      },
    });
    userId[key] = user.id;
  }
  console.log(`accounts ready: ${Object.values(PEOPLE).map((p) => p.email).join(', ')}`);

  // Rebuild from scratch so re-running converges on the same state. The cascade
  // takes columns, tasks, comments and memberships with it.
  await prisma.board.deleteMany({ where: { id: { in: BOARDS.map((b) => b.id) } } });

  const notifications: {
    userId: string;
    type: 'TASK_ASSIGNED' | 'TASK_COMMENTED';
    actorId: string;
    actorName: string;
    boardId: string;
    boardTitle: string;
    taskId: string;
    taskTitle: string;
    createdAt: Date;
  }[] = [];

  for (const spec of BOARDS) {
    const ownerId = userId[spec.owner];

    await prisma.board.create({
      data: {
        id: spec.id,
        title: spec.title,
        description: spec.description,
        ownerId,
        members: {
          create: spec.members.map((m) => ({ userId: userId[m.who], role: m.role })),
        },
        columns: {
          create: spec.columns.map((col, order) => ({
            id: col.id,
            title: col.title,
            order,
            tasks: {
              create: col.tasks.map((task, taskOrder) => ({
                id: task.id,
                title: task.title,
                description: task.description ?? null,
                order: taskOrder,
                priority: task.priority,
                status: task.status ?? 'INCOMPLETED',
                assigneeId: task.assignee ? userId[task.assignee] : null,
                comments: {
                  create: (task.comments ?? []).map((c) => ({
                    content: c.text,
                    userId: userId[c.by],
                    createdAt: ago(c.minutesAgo),
                  })),
                },
              })),
            },
          })),
        },
      },
    });

    // Mirror what the app would have written while this activity happened: the
    // assignee hears about the assignment, and everyone on the thread hears
    // about comments they did not write.
    for (const col of spec.columns) {
      for (const task of col.tasks) {
        if (task.assignee && userId[task.assignee] !== ownerId) {
          notifications.push({
            userId: userId[task.assignee],
            type: 'TASK_ASSIGNED',
            actorId: ownerId,
            actorName: PEOPLE[spec.owner].name,
            boardId: spec.id,
            boardTitle: spec.title,
            taskId: task.id,
            taskTitle: task.title,
            createdAt: ago(480),
          });
        }

        const participants = new Set((task.comments ?? []).map((c) => c.by));
        if (task.assignee) participants.add(task.assignee);
        for (const comment of task.comments ?? []) {
          for (const who of participants) {
            if (who === comment.by) continue;
            notifications.push({
              userId: userId[who],
              type: 'TASK_COMMENTED',
              actorId: userId[comment.by],
              actorName: PEOPLE[comment.by].name,
              boardId: spec.id,
              boardTitle: spec.title,
              taskId: task.id,
              taskTitle: task.title,
              createdAt: ago(comment.minutesAgo),
            });
          }
        }
      }
    }

    const taskCount = spec.columns.reduce((n, c) => n + c.tasks.length, 0);
    const commentCount = spec.columns.reduce(
      (n, c) => n + c.tasks.reduce((m, t) => m + (t.comments?.length ?? 0), 0),
      0
    );
    console.log(
      `${spec.title}: ${spec.columns.length} columns, ${taskCount} tasks, ${commentCount} comments, ${spec.members.length} members`
    );
  }

  // Only the demo's own notifications are replaced, so anything generated by
  // real use of the app survives a reseed.
  await prisma.notification.deleteMany({ where: { boardId: { in: BOARDS.map((b) => b.id) } } });
  await prisma.notification.createMany({ data: notifications });
  console.log(`${notifications.length} notifications`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
    console.log('\nSeed complete. Sign in at http://localhost:3000/auth/signin');
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
