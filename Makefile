.PHONY: test data dev
dev:
	uv run uvicorn app.main:app --reload --app-dir backend --port 8000
test:
	uv run pytest -q
data:
	uv run python scripts/build_hmis_parquet.py
	uv run python scripts/build_reference.py
	uv run python scripts/build_commodities.py
	uv run python scripts/build_facilities.py
	uv run python scripts/simulate.py
	uv run python scripts/build_demo_db.py

# --- deploy: API on Cloud Run, web on Firebase Hosting (project sanjeevani-grid, region asia-south1) ---
deploy-api:
	gcloud run deploy sanjeevani-api --source . --region asia-south1 --project sanjeevani-grid \
	  --allow-unauthenticated --memory 4Gi --cpu 2 --concurrency 20 --timeout 300 --cpu-boost --min-instances 1 --max-instances 1 \
	  --set-secrets GEMINI_API_KEY=gemini-api-key:latest --set-env-vars GEMINI_MODE=live,GCP_PROJECT_ID=sanjeevani-grid,BQ_DATASET=sanjeevani
deploy-web:
	cd frontend && npm ci && npm run build
	npx firebase-tools deploy --only hosting --project sanjeevani-grid
