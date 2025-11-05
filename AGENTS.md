# Repository Guidelines

## Project Structure & Module Organization
- Monorepo (pnpm + Python). TypeScript packages under `packages/*`: `orchestrator` (LangGraph service), `architecture-agent`, `quality-agent`, `shared`, `cli`.
- Python agents in `packages/agents/src`; supporting libs in `packages/memtech`.
- Tests: TS in `packages/*/{test,tests}`; Python in top-level `test/` and `tests/`.
- Utilities in `scripts/`; docs in `docs/`; examples/data in `examples/`, `demo_data/`, `data/`.

## Build, Test, and Development Commands
- Prereqs: Node >= 20, pnpm >= 8, Python >= 3.8.
- Install deps: `pnpm install`.
- Orchestrator dev: `pnpm dev` or `pnpm --filter orchestrator dev`.
- Build all packages: `pnpm -r build`; clean: `pnnm clean`.
- Test all (runs `scripts/run-tests.sh`): `pnpm test`.
- Subsets: `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:coverage`.
- Per-package tests: `pnpm --filter <pkg> test`; Python only: `pytest -q`.
- Docker helpers: `pnpm docker:up`, `pnpm docker:down`; PM2: `pnpm pm2:start`.

## Coding Style & Naming Conventions
- TypeScript: ESLint + Prettier, 2-space indent; `camelCase` vars/functions; `PascalCase` classes/types; tests `*.test.ts`.
- Python: Black (88 cols) + isort; Flake8; Mypy (type hints on public funcs); Bandit. Names: `snake_case` functions/modules, `PascalCase` classes, `UPPER_SNAKE` constants.
- Lint/format: `pnpm -r lint`; Python: `black . && isort . && flake8 packages/agents/src && mypy packages/agents/src`.

## Testing Guidelines
- Frameworks: Jest/tsx for TS; Pytest for Python.
- Naming: Python files `test_*.py` with `test_*` funcs; TS tests in `test/` or `tests/` as `*.test.ts`.
- Coverage: Pytest writes to `test/reports/coverage`. Use markers `unit`, `integration`, `e2e`.
- Quick check before PR: `pnpm test:unit` and `pytest -q`.

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:` (e.g., `feat(orchestrator): add git watcher debounce`).
- PRs include: summary, packages/paths touched, linked issues, before/after notes, test results/logs (attach SARIF/coverage when relevant), and any config updates (`.env.example`, `config/`).
- Keep changes focused; respect monorepo boundaries.

## Security & Configuration
- Copy `.env.example` to `.env`; never commit secrets.
- Run scans: `pnpm run:security`, `pnpm run:quality`, `pnpm run:full-review`.
- Prefer shared utilities via `packages/shared`; avoid cross-package imports outside intended APIs.

