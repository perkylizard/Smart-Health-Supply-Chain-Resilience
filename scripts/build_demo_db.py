from sanjeevani import demo_db, paths

if __name__ == "__main__":
    stats = demo_db.build(paths.DATA / "demo.duckdb")
    for k, v in stats.items():
        print(f"{k}: {v:,}" if isinstance(v, int) else f"{k}: {v}")
