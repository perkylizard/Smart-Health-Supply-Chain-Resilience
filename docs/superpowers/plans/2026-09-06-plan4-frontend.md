# Plan 4: Frontend (the three screens)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The working prototype a judge can click: Morning briefing, Dispatch board, Ask the district, plus the facility card, scenario dial, system panel shell, and the PHC web-chat widget, all against the FastAPI service.

**Architecture:** React 18 + Vite + TypeScript in `frontend/`. One design-token file, a small component set, three screens as routes. Data via a typed `api.ts` client with React Query for caching and optimistic transfer approvals. Map with MapLibre GL and OpenStreetMap raster tiles (no key). No component library beyond Radix primitives for menus and dialogs. Vitest for unit tests, Playwright for the hero flow.

**Tech Stack:** react, react-dom, react-router-dom, @tanstack/react-query, maplibre-gl, @radix-ui/react-dialog and dropdown-menu, vitest, @playwright/test. Fonts from Google Fonts: Inter, Noto Sans Devanagari.

**Spec:** Section 4 (all subsections), 4.9 visual direction

## Global Constraints
- Every number rendered carries provenance from the API; the badge component is mandatory wherever a metric is shown.
- Colour never the only signal: severity always pairs an icon glyph and the number of days.
- Works at 360 px width; touch targets at least 44 px; keyboard reachable; contrast AA.
- Hindi toggle switches all UI strings (i18n file) and passes `lang` to AI routes.
- Performance budget: briefing route interactive under 2 s on a throttled 3G profile with a warm API; map tiles lazy.
- The API base URL comes from `VITE_API_URL` (default `http://localhost:8000`).
- Commit after every task.

## File structure
```
frontend/index.html, vite.config.ts, tsconfig.json, package.json
frontend/src/main.tsx, App.tsx (router, shell), api.ts (typed fetchers), i18n.ts (en/hi strings), tokens.css, global.css
frontend/src/components/: Shell.tsx, DistrictSwitcher.tsx, LangToggle.tsx, ScenarioDial.tsx, AskBar.tsx, Badge.tsx (provenance),
  SeverityPill.tsx, Gauge.tsx, Sparkline.tsx, MapView.tsx, AlertRow.tsx, TransferCard.tsx, Stepper.tsx, ChatWidget.tsx, DataTable.tsx, ChartMini.tsx
frontend/src/screens/: Briefing.tsx, Dispatch.tsx, Ask.tsx, Facility.tsx, System.tsx
frontend/src/test/*.test.tsx (vitest), frontend/e2e/hero.spec.ts (playwright)
```

### Task 1: Scaffold, tokens, shell
- [ ] `npm create vite@latest frontend -- --template react-ts`; add deps; `tokens.css` with the palette (deep teal primary `#0F6E6E`, sand surfaces `#F7F3EC`/`#FFFDF9`, ink `#1B1F23`, severity red `#C8372D`, amber `#D9891B`, green `#2E7D5B`, blue for data-issue `#3B6FB6`), spacing scale 4/8/12/16/24/32, radius 8/12, type scale 13/15/17/22/28 with tabular numerals.
- [ ] Shell: top strip (district switcher, language toggle, scenario dial, ask bar), left rail with four icons (Briefing, Dispatch, Ask, System), offline banner reading `/health`.
- [ ] Dark theme via `prefers-color-scheme` tokens.
- [ ] Vitest smoke test renders the shell. Commit.

### Task 2: Briefing screen
- [ ] Headline card from `/ai/briefing` with a "why" link opening explain-this in a dialog; skeleton while loading; fallback text when status is fallback.
- [ ] MapView: PHC dots coloured by worst severity from `/districts/{u}/{d}/facilities`, click opens the facility card route; DH square, CHC larger dot; `© OpenStreetMap contributors` attribution.
- [ ] Alert list from summary: facility, commodity, days pill, cause chip, one action button that links to Dispatch filtered by commodity.
- [ ] Right column: Gauge (score, rank of N), three Sparklines with deltas.
- [ ] Quiet state when no red or amber alerts. Tests: renders alerts from a fixture; severity pill shows icon + number. Commit.

### Task 3: Dispatch board
- [ ] Three lanes: Needs, Proposed transfers (cards with quantity, km, ETA, reason, cross-district marker), In transit (stepper proposed → approved → picked up → delivered).
- [ ] Approve (optimistic), Approve all with confirmation dialog listing every transfer, Reject with the two-option reason picker; status persists via API.
- [ ] Route preview: selecting a card draws a line on a small map. Tests: approve moves a card between lanes. Commit.

### Task 4: Ask the district
- [ ] Input with voice button placeholder, example chips, guided/advanced switch; results as sentence + chart (ChartMini: bar/line via SVG) + DataTable with CSV export; advanced mode shows the SQL editor and check result; history list with "add to weekly brief" action (stores locally for Task 6 of Plan 3).
- [ ] Tests: renders a guided result fixture with a bar chart. Commit.

### Task 5: Facility card, System panel, chat widget
- [ ] Facility route: header, provenance badge (osm/simulated), stock table sorted by days, forecast mini-chart for top 5, staff table, bed bar, entries list.
- [ ] System: scenario dial (large), data health from `/health` and facility counts, federated panel placeholder that reads `/federated/replay` when Plan 5 lands (shows "coming" until then).
- [ ] ChatWidget: simulated WhatsApp thread for PHC staff: text entry, photo upload, voice note upload (posts to `/ai/entries/*` when available; otherwise to `/entries`), confirmation card with 1/2 reply. Commit.

### Task 6: Hero flow e2e and polish
- [ ] Playwright: open Araria, move the dial to monsoon, expect amber/red count to rise, open Dispatch, approve one transfer, see it in transit, open System.
- [ ] Lighthouse pass on Briefing; fix anything under the budget. Commit.

## Self-review
Covers spec 4.1–4.8; 4.9 direction applied in Task 1 tokens. Weekly brief button lands with Plan 3 Task 6. WhatsApp real transport is Plan 5.
