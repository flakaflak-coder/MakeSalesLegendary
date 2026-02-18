# Code Style Rules

## Python (Backend)

- Python 3.12+ — use modern syntax (match/case, type unions with `|`, etc.)
- Lint and format with `ruff` — run `ruff check . && ruff format .` before committing
- Type hints on all function signatures and return types
- `pydantic` for all data models and API schemas — never use raw dicts for structured data
- SQLAlchemy ORM for all database access — no raw SQL in application code
- Alembic for all schema changes — never modify tables manually
- Import order: stdlib → third-party → local, separated by blank lines
- Use `async def` for all API endpoints and I/O-bound operations
- Docstrings only where the function name and types don't make the purpose obvious

## TypeScript (Frontend)

- TypeScript strict mode — no `any` types, no `@ts-ignore`
- Next.js 14+ App Router conventions — server components by default, `"use client"` only when needed
- Tailwind CSS for all styling — no CSS modules or styled-components
- Name components in PascalCase, utilities in camelCase
- Co-locate component files: `ComponentName/index.tsx`, `ComponentName/types.ts`
- Use `fetch` with Next.js caching for API calls from server components

## General

- Descriptive variable names — no single-letter variables except loop counters
- Functions do one thing — if a function name has "and" in it, split it
- Prefer early returns over nested conditionals
- Configuration values come from environment or database, never hardcoded
