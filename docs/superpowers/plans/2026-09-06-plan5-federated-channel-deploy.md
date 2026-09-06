# Plan 5: Federated demo, PHC channel, deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The BRICS story (India + Brazil federated training, replay and live), the PHC staff channel transport, and a deployed link on Google Cloud with a stable production environment through 23 October.

**Architecture:** Federated averaging (McMahan et al. 2017) implemented transparently in numpy over a small logistic stock-out-risk model, two in-process clients, round metrics streamed over a websocket; replay from a stored JSON. Brazil node data: facility x product stock rows from the Ministry of Health open API (real), extended into a monthly ledger with the same simulator and labelled as such. Deployment: one Cloud Run service (FastAPI + DuckDB inside the image), Firebase Hosting for the static frontend, GitHub Actions deploy on tag.

**Tech Stack:** numpy, fastapi websockets, requests; Docker; gcloud, firebase-tools.

**Spec:** Sections 3.5, 4.5, 4.6, 5.1, 5.2. Deviation recorded: the federated protocol is hand-rolled FedAvg rather than the Flower framework, chosen for transparency, zero heavy dependencies, and a live run that finishes in seconds; the README says so.

## Global Constraints
- No personal data: Brazil facility contact fields are dropped at ingestion; only cnes code, municipality, coordinates, product, quantity, date are kept.
- "Records crossed the border: 0" must be literally true: only model weight vectors move between nodes in code, and a test asserts the aggregator never receives a row.
- Production freeze 28 Sep; uptime check through 23 Oct.
- Commit after every task.

### Task 1: Brazil node data
- `scripts/fetch_brazil.py`: pull Hórus stock rows for one state (Acre, uf 12) for the two populated months (202608, 202609) and the UBS list for Acre; strip contact fields; write `data/processed/brazil_stock.parquet`, `brazil_facilities.parquet`; map CATMAT product descriptions to our commodity ids by name rules (ORS = "SAIS PARA REIDRATACAO", zinc = "ZINCO", albendazole, amoxicilina, paracetamol, metformina, ...). Test: at least 500 rows, no contact columns, >= 5 mapped commodities.

### Task 2: Federated engine
- `backend/sanjeevani/federated/model.py`: logistic regression on features [days_of_stock, demand_trend, cases_delta, lead_days, month_sin, month_cos] predicting stock-out next month; numpy SGD; `train_local(X, y, w, epochs)`, `evaluate(X, y, w)` (AUC, log-loss).
- `backend/sanjeevani/federated/fedavg.py`: `run(rounds, clients: list[Client]) -> list[RoundMetrics]`; client = name + (X, y); weighted average by sample count; counter of rows seen by the aggregator asserted 0.
- `backend/sanjeevani/federated/nodes.py`: builds India (hero unit simulated ledger) and Brazil (Task 1 ledger) datasets with identical feature code.
- `scripts/federated_replay.py`: runs 5 rounds, writes `data/processed/federated_replay.json` (per round: global metrics, per-node local-only vs federated).
- Tests: federated global AUC >= local-only AUC on the held-out node split for at least one node; rows-crossed == 0; deterministic under seed.

### Task 3: API and panel
- Routes: `GET /federated/replay`, `WS /federated/live` (streams round events), `GET /federated/nodes` (counts, sources).
- Frontend System panel: two flag cards, round chart (local vs federated), counter, Replay and Run live buttons.

### Task 4: PHC channel transport
- `POST /channel/inbound` webhook shape compatible with WhatsApp Cloud API text/image/audio messages; routes text to the local parser, media to the Gemini services when available; replies through a provider interface with a `ConsoleProvider` (logs) and `WhatsAppProvider` (env-configured, optional).
- Frontend chat widget posts to the same route so the demo and the real transport share one code path.

### Task 5: Deployment
- `Dockerfile` (python 3.12-slim, uv, demo.duckdb copied in), `cloudbuild`-free path: `gcloud run deploy` from GitHub Actions on tag `v*`; `firebase.json` for hosting with `/api/**` rewrite to the Cloud Run service; `VITE_API_URL` baked at build.
- Uptime check: GitHub Actions cron every 10 min hitting `/health`, failing loudly by email.
- README: deploy steps, environment variables, cost expectations.

### Task 6: Playwright hero flow, video script
- `frontend/e2e/hero.spec.ts` against staging; doubles as the video storyboard.
