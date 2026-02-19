# Collaboration Rules

## Team

| Developer | GitHub Handle |
|-----------|---------------|
| Marcus    | @flakaflak-coder |
| Jeroen    | (TBD) |

**Geen vaste domeinen.** Beide developers kunnen aan alles werken (backend, frontend, infra). De enige regel: documenteer wie waaraan werkt zodat Claude conflicten kan detecteren.

## Assignment Tracking — VERPLICHT

Active assignments worden bijgehouden in `docs/assignments.md`.

**Claude MOET bij elke sessie-start `docs/assignments.md` lezen.** Dit is niet optioneel.

**Voor het aanpassen van een bestand**, check `docs/assignments.md`:
1. Bestand staat onder een actieve taak van de **andere** developer → **STOP en waarschuw**: "Let op: [bestand] hoort bij [naam]'s actieve taak '[taaknaam]'. Overleg even voor je verder gaat."
2. Bestand zit in een gedeeld gebied (models, schemas, config, main.py) en de andere developer is ook actief → **meld het**: "Heads up: [naam] werkt ook actief. [bestand] is gedeeld — check even of dit geen conflict geeft."
3. Geen overlap → gewoon doorgaan

## Plan Document Format

Elke taak in een plan doc heeft een `**Assignee:**` veld:

```markdown
### Task N: [Component Name]
**Assignee:** Marcus | Jeroen | Unassigned
**Files:**
- Create: `path/to/file.py`
- Modify: `path/to/existing.py`
```

Assignees worden bij het schrijven van het plan **voorgesteld**, maar kunnen altijd gewisseld worden. Update `docs/assignments.md` wanneer iemand een taak oppakt.

## Conflict Warning Rules

**STOP en waarschuw (wacht op bevestiging):**
- Beide developers hebben actieve taken die hetzelfde bestand raken
- Een Alembic migration wordt aangemaakt terwijl de andere developer ook pending migrations heeft
- Wijzigingen aan `app/main.py`, `app/database.py`, `app/config.py`, of `pyproject.toml` terwijl de andere developer actief is

**Meld maar ga door:**
- Beide developers werken in dezelfde directory
- Wijzigingen aan gedeelde schemas of models
- Wijzigingen aan `package.json`

**Geen waarschuwing nodig:**
- Developers werken in volledig gescheiden gebieden
- Test files zonder gedeelde fixtures
- Documentatie

## Branch Strategy

- Feature branches: `marcus/<feature>` of `jeroen/<feature>`
- Branch altijd van `main`
- PR vereist voor merge naar `main`
- De andere developer reviewt de PR

## Workflow

Bij het starten van een taak:
1. Update `docs/assignments.md` (naam, branch, bestanden, status)
2. Maak een feature branch
3. Werk aan de taak
4. PR → review door andere developer → merge
5. Update `docs/assignments.md` (status → Done)
