# Collboard Setup Guide

This guide will help you set up the Collboard project for local development.

## Prerequisites

- Node.js 18 or higher
- npm 11 or higher
- Docker and Docker Compose (for local PostgreSQL and Redis)
- Git

## Initial Setup

### 1. Clone the repository

```bash
git clone https://github.com/elx3020/collboard.git
cd collboard
```

### 2. Install dependencies

```bash
npm install
```

This will install all dependencies for all workspaces in the monorepo.

### 3. Set up environment variables

Copy the example environment file:

```bash
cp .env.example apps/web/.env
```

Or create `apps/web/.env` with the following content:

```env
DATABASE_URL="postgresql://collboard:collboard@localhost:5432/collboard?schema=public"
NEXTAUTH_SECRET="your-secret-key-here-change-in-production"
NEXTAUTH_URL="http://localhost:3000"
REDIS_URL="redis://localhost:6379"
```

**Important:** Generate a secure `NEXTAUTH_SECRET` for production:

```bash
openssl rand -base64 32
```

### 4. Start local services

Start PostgreSQL and Redis using Docker Compose:

```bash
docker-compose up -d
```

Verify services are running:

```bash
docker-compose ps
```

You should see:

- `collboard-postgres` running on port 5432
- `collboard-redis` running on port 6379

### 5. Set up the database

Generate Prisma Client and run migrations:

```bash
cd apps/web
npx prisma generate
npx prisma migrate dev --name init
```

This will:

- Generate the Prisma Client
- Create the database schema
- Apply initial migrations

### 6. Start the development server

From the root directory:

```bash
npm run dev
```

Or to run only the web app:

```bash
cd apps/web
npm run dev
```

The application will be available at:

- Web App: http://localhost:3000
- Docs: http://localhost:3001

## Development Workflow

### Running Commands

From the root directory, you can run commands for all workspaces:

```bash
npm run dev          # Start all apps in development mode
npm run build        # Build all apps and packages
npm run lint         # Lint all code
npm run format       # Format all code with Prettier
npm run check-types  # Type-check all TypeScript code
```

### Working with Prisma

```bash
cd apps/web

# Generate Prisma Client (run after schema changes)
npx prisma generate

# Create a new migration
npx prisma migrate dev --name <migration-name>

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# View database with SQL
docker exec -it collboard-postgres psql -U collboard -d collboard
```

### Git Hooks

This project uses Husky for Git hooks:

- **pre-commit**: Runs linting and formatting on staged files

If you need to bypass hooks temporarily:

```bash
git commit --no-verify
```

## Database Schema

The application uses the following models:

- **User**: User accounts and authentication
- **Board**: Kanban boards
- **BoardMember**: Board access control (OWNER, EDITOR, VIEWER)
- **Column**: Board columns (To Do, In Progress, Done, etc.)
- **Task**: Individual task cards
- **Comment**: Comments on tasks

## Testing the Setup

### 1. Check the health endpoint

Once the dev server is running, test the health check endpoint:

```bash
curl http://localhost:3000/api/health
```

You should see:

```json
{
  "status": "ok",
  "message": "Collboard API is running",
  "database": "connected",
  "timestamp": "2024-02-09T12:00:00.000Z"
}
```

### 2. Open Prisma Studio

```bash
cd apps/web
npx prisma studio
```

This opens a GUI at http://localhost:5555 to view and edit your database.

## Troubleshooting

### Port already in use

If ports 3000, 3001, 5432, or 6379 are already in use:

1. Stop the conflicting service
2. Or change the port in the respective configuration

### Docker services not starting

```bash
# Stop all services
docker-compose down

# Remove volumes and start fresh
docker-compose down -v
docker-compose up -d
```

### Prisma Client not found

```bash
cd apps/web
npx prisma generate
```

### Database connection errors

1. Ensure Docker services are running: `docker-compose ps`
2. Check the DATABASE_URL in `apps/web/.env`
3. Verify PostgreSQL is accessible:
   ```bash
   docker exec -it collboard-postgres pg_isready -U collboard
   ```

### Build errors

```bash
# Clean build artifacts
rm -rf apps/web/.next
rm -rf apps/docs/.next
rm -rf node_modules
rm -rf package-lock.json

# Reinstall and rebuild
npm install
npm run build
```

## Next Steps

Now that your environment is set up, you can:

1. Start building features (see README.md for the project roadmap)
2. Explore the codebase
3. Check out the API documentation
4. Run tests: `npm run test` (once tests are added)

## Getting Help

- Check the [main README](README.md) for project overview
- Review the [Prisma schema](apps/web/prisma/schema.prisma) for database structure
- Check the [API routes](apps/web/app/api) for available endpoints

## Production Deployment

See the deployment section in the main [README](README.md) for production deployment instructions.
