---
name: fix-issue
description: Fix a GitHub issue by number. Reads the issue, implements a fix, and creates a PR.
---

# /fix-issue [issue-number]

Fix GitHub issue #[issue-number]:

1. Read the issue with `gh issue view [issue-number]`
2. Understand the problem — search the codebase for relevant files
3. Check if the issue relates to a specific search profile or is engine-wide
4. Implement a fix following project conventions (see CLAUDE.md § Coding Standards)
5. Write tests that verify the fix (pytest for backend, Vitest for frontend)
6. Run the test suite: `cd backend && pytest` and/or `cd frontend && npm run test`
7. Run linting: `cd backend && ruff check . && ruff format --check .`
8. Create a descriptive commit referencing the issue: `git commit -m "Fix #[issue-number]: ..."`
9. Create a PR: `gh pr create --title "Fix #[issue-number]: ..." --body "Closes #[issue-number]\n\n## What\n...\n## Why\n...\n## Testing\n..."`
