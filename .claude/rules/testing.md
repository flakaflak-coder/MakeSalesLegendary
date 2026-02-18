# Testing Rules

## Backend (pytest)

- Test runner: `pytest` — run with `cd backend && pytest`
- Test file naming: `test_<module>.py` in `tests/` directory
- Use `pytest-asyncio` for async test functions
- Fixtures in `conftest.py` — database fixtures use transactions that roll back
- Integration tests for scraping and enrichment pipelines are mandatory
- Mock external APIs (SerpAPI, KvK, Claude) — never hit real APIs in tests
- Test scoring calculations with known inputs and expected outputs
- Every new API endpoint needs at least: happy path, validation error, not found

## Frontend

- Run with: `cd frontend && npm run test` (when set up)
- Test framework: Vitest + React Testing Library
- Test user interactions, not implementation details
- Mock API responses with MSW (Mock Service Worker)

## What to Test

- Scoring engine: verify score calculations match expected output for known profiles
- LLM extraction: test prompt construction and response parsing (mock LLM responses)
- Deduplication: verify company-level aggregation logic
- API endpoints: request validation, response shape, error handling
- Search profile CRUD: verify config changes propagate correctly

## What Not to Test

- Don't test framework behavior (FastAPI routing, SQLAlchemy query building)
- Don't test trivial getters/setters
- Don't write tests that just assert the mock was called
