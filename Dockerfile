# Sanjeevani Grid API for Cloud Run. Build from the repo root:
#   gcloud run deploy sanjeevani-api --source . --region asia-south1
# The image carries the demo DuckDB and the processed parquet files the API reads at runtime.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend
WORKDIR /app

# dependencies first so they cache between builds
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# code and the data the API reads (paths.py resolves everything relative to /app)
COPY backend ./backend
COPY data/reference ./data/reference
COPY data/scenarios ./data/scenarios
COPY data/demo.duckdb ./data/demo.duckdb
COPY data/processed/bq_district_forecast.parquet \
     data/processed/hmis_ledger.parquet \
     data/processed/hmis_ledger_synth.parquet \
     data/processed/brazil_synth_ledger.parquet \
     data/processed/hmis_c2.parquet \
     data/processed/federated_replay.json \
     ./data/processed/

ENV PATH="/app/.venv/bin:$PATH" GEMINI_MODE=live PORT=8080
EXPOSE 8080
# the app strips a leading /api itself (Firebase Hosting forwards /api/** with the prefix intact)
CMD exec uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT}
