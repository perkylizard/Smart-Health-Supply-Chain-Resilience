.PHONY: test data
test:
	uv run pytest -q
data:
	uv run python scripts/build_hmis_parquet.py
	uv run python scripts/build_reference.py
	uv run python scripts/build_commodities.py
	uv run python scripts/build_facilities.py
	uv run python scripts/simulate.py
	uv run python scripts/build_demo_db.py
