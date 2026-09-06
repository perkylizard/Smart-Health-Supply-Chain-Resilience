"""Build data/processed/districts.parquet from HMIS districts + Census 2011 + NFHS-5."""
from sanjeevani import paths, reference

if __name__ == "__main__":
    df, unmatched = reference.build_districts()
    df.to_parquet(paths.DATA_PROCESSED / "districts.parquet", index=False)
    print(f"districts: {len(df)} rows, {df.state.nunique()} states; census-matched {int((df.pop_source=='census2011').sum())}, nfhs-matched {int(df.nfhs5_present.sum())}")
    demo = {"Bihar","Uttar Pradesh","Rajasthan","Madhya Pradesh","Andhra Pradesh","Telangana","Karnataka","Arunachal Pradesh","Jammu & Kashmir","Lakshadweep","A & N Islands","Chhattisgarh"}
    u = unmatched[unmatched.state.isin(demo)]
    print("demo-state districts without census pop or nfhs row:")
    print(u.to_string(index=False) if len(u) else "  none")
