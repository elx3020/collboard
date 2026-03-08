#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Local CI simulation script
#
#  Runs the same steps as the GitHub Actions CI pipeline locally:
#    1. quality  — lint + type-check
#    2. test     — unit & integration tests (needs postgres + redis)
#    3. e2e      — Playwright end-to-end tests
#    4. build    — Docker image build
#
#  Usage:
#    ./scripts/test-ci-local.sh              # run all stages
#    ./scripts/test-ci-local.sh quality      # run only lint & type-check
#    ./scripts/test-ci-local.sh test         # run only unit/integration tests
#    ./scripts/test-ci-local.sh e2e          # run only e2e tests
#    ./scripts/test-ci-local.sh build        # run only docker build
#    ./scripts/test-ci-local.sh quality test # run multiple stages
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Colour

COMPOSE_FILE="docker-compose.yml"
SERVICES_STARTED=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Helpers ─────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}▸ $1${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
fail()    { echo -e "${RED}✗ $1${NC}"; exit 1; }

header() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
}

cleanup() {
  if [ "$SERVICES_STARTED" = true ]; then
    echo ""
    info "Stopping CI services..."
    cd "$ROOT_DIR"
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
  fi
}
trap cleanup EXIT

start_services() {
  if [ "$SERVICES_STARTED" = true ]; then
    return 0
  fi

  info "Starting postgres & redis via docker compose..."
  cd "$ROOT_DIR"
  docker compose -f "$COMPOSE_FILE" up -d postgres redis

  info "Waiting for postgres to be ready..."
  local retries=30
  until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U collboard >/dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      fail "Postgres did not become ready in time"
    fi
    sleep 1
  done
  success "Postgres is ready"

  info "Waiting for redis to be ready..."
  retries=15
  until docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping >/dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      fail "Redis did not become ready in time"
    fi
    sleep 1
  done
  success "Redis is ready"

  SERVICES_STARTED=true
}

export_ci_env() {
  export DATABASE_URL="postgresql://collboard:collboard@localhost:5432/collboard?schema=public"
  export NEXTAUTH_SECRET="ci-test-secret-not-for-production"
  export NEXTAUTH_URL="http://localhost:3000"
  export REDIS_URL="redis://localhost:6379"
}

# ── Stages ──────────────────────────────────────────────────────────────────

stage_quality() {
  header "Stage: Lint & Type Check"
  cd "$ROOT_DIR"

  info "Installing dependencies..."
  npm ci

  info "Generating Prisma Client..."
  cd apps/web && npx prisma generate && cd "$ROOT_DIR"

  info "Running lint..."
  npm run lint

  info "Running type check..."
  npm run check-types

  success "Quality stage passed"
}

stage_test() {
  header "Stage: Unit & Integration Tests"
  cd "$ROOT_DIR"

  start_services
  export_ci_env

  info "Installing dependencies..."
  npm ci

  info "Generating Prisma Client & applying migrations..."
  cd apps/web
  npx prisma generate
  npx prisma migrate deploy

  info "Running tests with coverage..."
  npx vitest run --coverage

  cd "$ROOT_DIR"
  success "Test stage passed"
}

stage_e2e() {
  header "Stage: E2E Tests (Playwright)"
  cd "$ROOT_DIR"

  start_services
  export_ci_env

  info "Installing dependencies..."
  npm ci

  info "Installing Playwright browsers..."
  npx playwright install --with-deps chromium

  info "Generating Prisma Client & applying migrations..."
  cd apps/web
  npx prisma generate
  npx prisma migrate deploy
  cd "$ROOT_DIR"

  info "Running Playwright tests..."
  npx playwright test

  success "E2E stage passed"
}

stage_build() {
  header "Stage: Docker Image Build"
  cd "$ROOT_DIR"

  info "Building Docker image..."
  docker build -t collboard-web:local -f apps/web/Dockerfile .

  success "Docker image built: collboard-web:local"
}

# ── Main ────────────────────────────────────────────────────────────────────

cd "$ROOT_DIR"

STAGES=("$@")
if [ ${#STAGES[@]} -eq 0 ]; then
  STAGES=(quality test e2e build)
fi

echo -e "${CYAN}Collboard Local CI${NC}"
echo -e "Stages to run: ${YELLOW}${STAGES[*]}${NC}"

for stage in "${STAGES[@]}"; do
  case "$stage" in
    quality) stage_quality ;;
    test)    stage_test ;;
    e2e)     stage_e2e ;;
    build)   stage_build ;;
    *)       fail "Unknown stage: $stage (valid: quality, test, e2e, build)" ;;
  esac
done

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All CI stages passed locally!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
