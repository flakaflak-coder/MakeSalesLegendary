---
name: signal
description: Talk to the Signal Engine agent. Query leads, trigger harvests, check analytics, get pipeline status. Use when the user wants to interact with the Signal Engine.
---

# /signal [message]

Talk to the Signal Engine agent to query data or trigger actions.

## Usage

```
/signal hoeveel hot leads heb ik?
/signal harvest het AP profiel
/signal show analytics overview
/signal zoek leads van Randstad
/signal what's the pipeline status?
```

## Instructions

1. Take the user's message (the argument after `/signal`) and call the Signal Engine chat API:

```bash
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "<USER_MESSAGE>"}'
```

2. Parse the JSON response which has this structure:
   - `reply`: The agent's text response — display this directly to the user
   - `tool_calls`: Array of tools the agent called, each with `tool` (name) and `data` (result)

3. Format the output for the terminal:
   - Show the `reply` text first
   - If `tool_calls` contains lead data (`data.leads` array), format as a markdown table:
     ```
     | Company | Score | Status | Vacancies |
     |---------|-------|--------|-----------|
     ```
   - If `tool_calls` contains stats/overview data, format as key-value pairs
   - If `tool_calls` contains action confirmations (`data.status === "queued"`), show a confirmation line
   - If `tool_calls` contains errors (`data.error`), show the error clearly

4. If the API call fails with a connection error, tell the user to start the backend:
   ```
   Signal Engine backend is not running. Start it with:
   cd backend && uvicorn app.main:app --reload
   ```

5. If no argument is provided, show this help:
   ```
   Signal Engine Agent — ask me anything about your pipeline:

   Examples:
   /signal hoeveel hot leads heb ik?
   /signal harvest het AP profiel
   /signal show me the top 5 leads
   /signal analytics overview
   /signal zoek leads van [bedrijfsnaam]
   /signal trigger enrichment for profile 1
   /signal what's the harvest status?
   ```

## Notes

- The agent speaks Dutch and English — match the user's language
- The backend must be running at http://localhost:8000
- Available actions: query leads, search by company, get stats, trigger harvest/enrichment/scoring, get analytics, list profiles
