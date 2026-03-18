# 🚀 Collboard - Real-Time Collaborative Task Board

A modern, full-stack Kanban-style task board with real-time collaboration capabilities. Built with Next.js 14+, TypeScript, Prisma, PostgreSQL, and WebSockets.

## ✨ Features

- 🎯 **Kanban Board**: Drag-and-drop task management across multiple columns
- 👥 **Real-time Collaboration**: See changes from other users instantly via WebSockets
- 🔐 **Authentication & Authorization**: JWT-based auth with role-based access control (Owner, Editor, Viewer)
- 📊 **Database**: PostgreSQL with Prisma ORM for robust data management
- 🎨 **Modern UI**: Built with Tailwind CSS with dark/light mode support
- ⚡ **Monorepo**: Turborepo-powered monorepo for efficient builds and development
- 🧪 **Testing**: Unit, integration, and E2E tests
- 🐳 **Docker**: Docker Compose for local development environment

## 🏗️ Architecture

This project uses a monorepo structure powered by Turborepo:

```
collboard/
├── apps/
│   ├── web/          # Next.js frontend and API routes
│   └── docs/         # Documentation site
├── packages/
│   ├── ui/           # Shared React components
│   ├── eslint-config/    # Shared ESLint configuration
│   └── typescript-config/ # Shared TypeScript configuration
└── docker-compose.yml    # Local development services
```

## 📋 Prerequisites

- Node.js 18+
- npm 11+
- Docker & Docker Compose (for local database)

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/elx3020/collboard.git
cd collboard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start local services (PostgreSQL & Redis)

```bash
docker-compose up -d
```

This will start:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

### 4. Set up the database

```bash
cd apps/web
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Start the development server

```bash
# From the root directory
npm run dev
```

The application will be available at:

- Web App: http://localhost:3000
- Docs: http://localhost:3001

## 🗄️ Database Schema

The application uses the following database models:

- **User**: Authentication and user management
- **Board**: Kanban boards with ownership
- **BoardMember**: Role-based access control (OWNER, EDITOR, VIEWER)
- **Column**: Board columns (e.g., "To Do", "In Progress", "Done")
- **Task**: Individual tasks/cards with priority levels
- **Comment**: Comments on tasks

## 🛠️ Development

### Available Scripts

From the root directory:

```bash
npm run dev          # Start all apps in development mode
npm run build        # Build all apps and packages
npm run lint         # Lint all apps and packages
npm run format       # Format code with Prettier
npm run check-types  # Type-check all TypeScript code
```

### Working with Prisma

```bash
cd apps/web

# Generate Prisma Client
npx prisma generate

# Create a new migration
npx prisma migrate dev --name <migration-name>

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Pre-commit Hooks

This project uses Husky for Git hooks:

- Linting with ESLint
- Code formatting with Prettier
- Type checking

These run automatically before each commit.

## 📦 Tech Stack

| Layer     | Technology                                |
| --------- | ----------------------------------------- |
| Frontend  | Next.js 14+, React 19, TypeScript         |
| Styling   | Tailwind CSS                              |
| Backend   | Next.js API Routes                        |
| Database  | PostgreSQL + Prisma ORM                   |
| Real-time | Redis (for pub/sub)                       |
| Auth      | JWT / NextAuth.js                         |
| Monorepo  | Turborepo                                 |
| Testing   | Vitest, React Testing Library, Playwright |
| DevOps    | Docker, GitHub Actions                    |

## 🔐 Environment Variables

Copy `.env.example` to `.env` in `apps/web/`:

```env
DATABASE_URL="postgresql://collboard:collboard@localhost:5432/collboard?schema=public"
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
REDIS_URL="redis://localhost:6379"
```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e
```

## 📝 API Documentation

API routes are available under `/api`:

- `/api/auth/*` - Authentication endpoints
- `/api/boards` - Board CRUD operations
- `/api/boards/[id]/columns` - Column management
- `/api/tasks` - Task CRUD and reordering
- `/api/tasks/[id]/comments` - Comment management


## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

See [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Turborepo Documentation](https://turborepo.dev/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
