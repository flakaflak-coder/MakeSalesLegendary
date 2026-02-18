# Security Rules

## Secrets Management

- All API keys and secrets in `.env` — never committed to git
- Required secrets: `DATABASE_URL`, `REDIS_URL`, `SERPAPI_KEY`, `KVK_API_KEY`, `ANTHROPIC_API_KEY`
- Use `pydantic-settings` to load and validate env vars at startup
- Never log API keys, tokens, or credentials — even partially

## API Security

- Validate all user input with Pydantic schemas — reject unexpected fields
- Rate-limit scraping endpoints to prevent abuse
- Sanitize any user-provided search terms before passing to external APIs
- Use parameterized queries only (SQLAlchemy handles this — never bypass it)

## External API Calls

- Set timeouts on all HTTP requests (30s default, 60s for LLM calls)
- Retry with exponential backoff for transient failures (max 3 retries)
- Log all external API calls with status codes — but never log request/response bodies containing PII
- Handle API key rotation gracefully — the system should not crash if a key is invalid

## Data Protection

- Company data from KvK and vacancy texts may contain PII — handle accordingly
- Decision maker data (names, LinkedIn URLs) is sensitive — access-control when multi-tenant
- Never expose raw LLM prompts or responses in the frontend API
- Scoring breakdowns are fine to expose — they contain calculated values, not raw data

## LLM-Specific

- Never pass user-controlled input directly into LLM system prompts
- Validate and sanitize LLM outputs before storing in database
- Log all LLM interactions for audit but redact any PII in logs
