# MakeSalesLegendary — Personas

## Persona: The Signal Hunter

### Demographics
- **Represents:** Marcus & Jeroen
- **Role:** Sales / Business Development at Freeday
- **Location:** Netherlands
- **Context:** Small team selling AI Digital Workers (AP automation) to mid-market and enterprise companies

### Bio
Works at Freeday, a company that builds AI Digital Workers to automate Accounts Payable processes. Knows the product inside out and understands exactly which type of company would benefit — but finding those companies at the right moment is the hard part. Currently relies on manual prospecting: scanning job boards, checking LinkedIn, asking around. It works, but it doesn't scale and misses timing signals.

Believes that a company actively struggling to hire AP staff is the warmest possible lead — they're already feeling the pain that Freeday solves. Wants a system that does the hunting automatically and serves up prioritized, qualified leads every morning.

### Goals
1. **Primary goal:** Spend time selling, not searching — have a daily feed of pre-qualified, scored leads ready for outreach
2. **Secondary goal:** Understand *why* a lead is hot (scoring breakdown, vacancy signals) to craft relevant pitches
3. **Hidden goal:** Build a repeatable, data-driven sales motion that proves the commercial model works — not just for AP, but for every digital employee type Freeday launches

### Frustrations
1. Manual prospecting eats hours that should go to conversations and closing
2. No way to know *when* a company is ready — finding a company is easy, finding them at the right moment is hard
3. Leads go stale because there's no system tracking which companies have been contacted, what the outcome was, or when to follow up
4. Gut feeling drives prioritization instead of data — hard to explain to others why you're chasing one lead over another

### Tech Profile
- **Tech savviness:** 4/5 — comfortable with APIs, data tools, and building quick prototypes (Jeroen built a working agent pipeline)
- **Devices:** MacBook, phone for LinkedIn
- **Apps they love:** LinkedIn Sales Navigator (the network), HubSpot (CRM basics), Google Sheets (flexibility)
- **Apps they hate:** Overcomplicated BI tools that take 10 clicks to answer a simple question

### A Day in Their Life
**Morning:**
Check the Lead Board — what's new overnight? Any hot leads that jumped in score? Scan the top 5, read the scoring breakdowns, open the vacancy links for context. Pick 2-3 to reach out to today.

**Workday:**
Research the selected leads deeper — check the company website, look up decision makers on LinkedIn, draft personalized outreach. Between meetings, check if any existing leads got updated (new vacancies found, score changes). After a call or meeting, log feedback on the lead: "met with CFO, interested, follow-up next week" or "already using Basware, deprioritize."

**Evening:**
Quick glance at the Harvest Monitor — did today's scrape run clean? Any new profiles worth adding search terms to?

### Quotes
> "I know there are 50 companies out there right now struggling to fill AP roles. I just can't find them fast enough."

> "If I could see a ranked list every morning of companies that are desperate for AP help, sorted by how likely they are to buy — that's the dream."

> "Don't just tell me the score. Tell me *why* — what made this company a 87? Which vacancy? How long has it been open?"

### What Would Make Them Love It
- Waking up to a fresh Lead Board with overnight discoveries, already scored and ranked
- Scoring breakdowns that double as talking points for outreach ("I noticed you've been looking for AP staff for 3 months...")
- Being able to tweak scoring weights and instantly see the board re-rank — tuning the engine to match what actually converts

### What Would Make Them Leave
- Stale data — if the scraper breaks silently and they're looking at week-old leads without knowing
- Scores that don't match reality — if high-scored leads consistently don't convert and the system doesn't learn
- Having to do manual data entry to keep the system useful

### Willingness to Pay
Internal tool — the ROI is measured in deals closed per month, not subscription cost. Every qualified lead that converts to a Freeday customer is worth thousands in ARR.

---

## Persona Summary

| Persona | Type | Primary Goal | Key Frustration | Tech Level |
|---------|------|--------------|-----------------|------------|
| The Signal Hunter (Marcus & Jeroen) | Power user | Pre-qualified daily lead feed | Manual prospecting doesn't scale | 4/5 |

### Coverage Analysis
- **Use cases covered:** Lead discovery, lead qualification, scoring tuning, feedback logging, outreach prep
- **Use cases NOT covered (future):**
  - **Sales Manager** — someone who reviews analytics/conversion funnels across profiles but doesn't do outreach themselves
  - **Profile Designer** — product person who creates new search profiles for different digital employee types

### Key Insights
1. The persona is both the user AND the domain expert — they know which signals matter, which means the Scoring Tuner is a core feature, not a nice-to-have
2. Trust in the system is everything — if scores feel wrong or data feels stale, they'll stop using it and go back to manual methods
3. They think in terms of outreach context, not raw data — every feature should answer "how does this help me write a better first message?"

### Design Implications
- The Lead Board is the home screen — it must be fast, scannable, and always fresh
- Scoring breakdowns should read like talking points, not spreadsheet columns
- The feedback loop isn't a chore — frame it as "teach the engine what works" and make it two clicks, not a form
- Harvest health should be visible at a glance (green/yellow/red) — if the pipeline is broken, they need to know immediately
