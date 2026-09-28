"""Parse HMIS C2 district-level monthly files (HTML-as-.xls, 2008-2020, and .xlsx 2020-21)
into one long CSV: state, district, fy, month, section, item_code, item_name, measure, value.

Usage:
  python3 scripts/parse_hmis_c2.py --years 2019-2020 --states "Madhya Pradesh" "Bihar"
  python3 scripts/parse_hmis_c2.py --years 2017-2018 2018-2019 2019-2020      # all states
Output: data/processed/hmis_c2_<fy>_<state>.csv (one per state-year) + a combined manifest.
"""
import argparse, csv, os, re, sys, zipfile
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "C2. Data Itemwise Monthly (up to sub district)", "All States Across Districts")
OUT = os.path.join(ROOT, "data", "processed")
MONTHS = {"april":4,"may":5,"june":6,"july":7,"august":8,"september":9,"october":10,"november":11,"december":12,"january":1,"february":2,"march":3,
          "apr":4,"jun":6,"jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12,"jan":1,"feb":2,"mar":3}
SUBCOLS = ["Total","Public","Private","Urban","Rural"]

class _HTMLTable(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None
    def handle_starttag(self, t, a):
        if t=="tr": self.row=[]
        elif t in ("td","th") and self.row is not None: self.cell=""
    def handle_endtag(self, t):
        if t in ("td","th") and self.cell is not None: self.row.append(re.sub(r"\s+"," ",self.cell).strip()); self.cell=None
        elif t=="tr" and self.row is not None: self.rows.append(self.row); self.row=None
    def handle_data(self, d):
        if self.cell is not None: self.cell+=d

def read_html_xls(path):
    raw=open(path,"rb").read().decode("cp1252",errors="replace")
    p=_HTMLTable(); p.feed(raw); return p.rows

def read_xlsx(path):
    ns={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}; M="{%s}"%ns["m"]
    z=zipfile.ZipFile(path); ss=[]
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si",ns):
            ss.append("".join(t.text or "" for t in si.iter(M+"t")))
    sh=ET.fromstring(z.read("xl/worksheets/sheet1.xml")); rows=[]
    for r in sh.iter(M+"row"):
        vals=[]
        for c in r.findall("m:c",ns):
            t=c.get("t"); v=c.find("m:v",ns); is_=c.find("m:is",ns)
            if t=="inlineStr" and is_ is not None: vals.append("".join(x.text or "" for x in is_.iter(M+"t")))
            elif v is None: vals.append("")
            elif t=="s": vals.append(ss[int(v.text)])
            else: vals.append(v.text)
        vals=[re.sub(r"\s+"," ",str(x)).strip() for x in vals]
        rows.append(vals)
    return rows

def to_num(s):
    s=s.replace(",","").strip()
    if s in ("","NA","-","."): return ""
    try:
        f=float(s); return int(f) if f==int(f) else f
    except ValueError: return ""

def _same_state(a, b):
    """'Jammu And Kashmir' == 'Jammu & Kashmir': compare ignoring &/and, case and spacing."""
    f = lambda x: re.sub(r"\s+", " ", x.lower().replace("&", "and")).strip()
    return f(a) == f(b)

def parse_rows(rows, state, fy, month):
    """Yield long records. Handles both the HTML layout (section cell only on first row of a section,
    data starts col 0) and the xlsx layout (section repeated in col 0, code in col 1)."""
    # locate district header row: first row with >=3 non-empty cells where a cell equals state or "_"+state
    # the title row spells the state the way the header row does ("Chhattisgarh" in a "Chattisgarh" folder)
    m=re.match(r"^Data ItemWise Report for (.+)$", (rows[0][0] if rows and rows[0] else "") or "")
    label=m.group(1).strip() if m else state
    hdr_i=None
    for i,r in enumerate(rows[:12]):
        if any(_same_state(c.lstrip("_"), label) or _same_state(c.lstrip("_"), state) for c in r if c): hdr_i=i; break
    if hdr_i is None: raise ValueError("district header row not found")
    districts=[c.lstrip("_").strip() for c in rows[hdr_i] if c.strip()]
    if districts and (_same_state(districts[0], state) or _same_state(districts[0], label)): districts[0]=state   # state row keeps the folder spelling
    else: districts=[state]+districts  # xlsx variant lacks leading blank
    n=len(districts)
    section=None; out=[]
    for r in rows[hdr_i+2:]:
        if not r or not any(r): continue
        cells=list(r)
        # xlsx layout: col0 section, col1 code (may start with '), col2 name, col3 measure, values from col4
        cells=[c.strip("'") if i<2 else c for i,c in enumerate(cells)]
        if re.match(r"^M\d+ \[", cells[0]) and len(cells)>4 and re.match(r"^\d", cells[1] or ""):
            section=cells[0]; code=cells[1]; name=cells[2]; measure=cells[3]; vals=cells[4:]
        elif re.match(r"^M\d+ \[", cells[0]):           # html: section starts here, shift by one
            section=cells[0]; cells=cells[1:]
            cells=[c.strip("'") if i<1 else c for i,c in enumerate(cells)]
            code,name,measure,vals=cells[0],cells[1],cells[2],cells[3:]
        elif re.match(r"^\d+(\.\d+)*[a-z]?$", cells[0] or ""):   # html item row
            code,name,measure,vals=cells[0],cells[1],cells[2],cells[3:]
        elif re.match(r"^\d\. ", cells[0] or ""):        # html stock sub-row: measure in col0, value in col1, then per-district
            measure=cells[0]; vals=cells[1:]
            # these belong to the previous item
            if not out: continue
            code,name=out[-1][5],out[-1][6]
        else:
            continue
        if measure=="TOTAL":
            # 5 sub-columns per district
            for di,d in enumerate(districts):
                for si,sc in enumerate(SUBCOLS):
                    k=di*5+si
                    if k<len(vals):
                        v=to_num(vals[k])
                        if v!="": out.append((state,d,fy,month,section,code,name,sc,v))
        else:
            # stock field: html puts state value in col1 then per-district values spaced by 5 cols (only first sub-col used)
            # xlsx puts values per district at every 5th col as well. Take every 5th starting at 0.
            for di,d in enumerate(districts):
                k=di*5
                if k<len(vals):
                    v=to_num(vals[k])
                    if v!="": out.append((state,d,fy,month,section,code,name,measure.strip(),v))
    return out

def month_from_name(fn):
    m=re.search(r"_(?:UpTo_)?([A-Za-z]+)\.xlsx?$", fn)
    return MONTHS.get(m.group(1).lower()) if m else None

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--years",nargs="+",required=True); ap.add_argument("--states",nargs="*"); ap.add_argument("--limit",type=int)
    a=ap.parse_args(); os.makedirs(OUT,exist_ok=True); manifest=[]
    for fy in a.years:
        ydir=os.path.join(RAW,fy)
        sub=next((d for d in os.listdir(ydir) if "onthwise" in d),None)
        if not sub: print("no monthwise folder in",fy); continue
        states=sorted(d for d in os.listdir(os.path.join(ydir,sub)) if not d.startswith("."))
        if a.states: states=[s for s in states if s in a.states]
        for st in states:
            sdir=os.path.join(ydir,sub,st); files=sorted(f for f in os.listdir(sdir) if f.endswith((".xls",".xlsx")))
            if a.limit: files=files[:a.limit]
            recs=[]; errs=[]
            for f in files:
                mo=month_from_name(f)
                try:
                    rows=read_xlsx(os.path.join(sdir,f)) if f.endswith(".xlsx") else read_html_xls(os.path.join(sdir,f))
                    recs.extend(parse_rows(rows,st,fy,mo))
                except Exception as e:
                    errs.append(f"{f}: {type(e).__name__}: {e}")
            outp=os.path.join(OUT,f"hmis_c2_{fy[:4]}-{fy[7:9]}_{st.replace(' ','_').replace('&','and')}.csv")
            with open(outp,"w",newline="",encoding="utf-8") as fh:
                w=csv.writer(fh); w.writerow(["state","district","fy","month","section","item_code","item_name","measure","value"]); w.writerows(recs)
            print(f"{fy} {st:22s} files={len(files):2d} rows={len(recs):8d} errors={len(errs)}"); 
            for e in errs: print("   ",e)
            manifest.append((fy,st,len(files),len(recs),len(errs)))
    with open(os.path.join(OUT,"hmis_c2_manifest.csv"),"a",newline="") as fh:
        csv.writer(fh).writerows(manifest)

if __name__=="__main__": main()
