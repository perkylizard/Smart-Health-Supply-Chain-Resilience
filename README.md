# Sanjeevani Grid

Federated AI platform for national-scale PHC medicine stock, bed, and staffing resilience.
Built for the Hack2Skill x Google BRICS Hackathon, Track 3: Smart Health & Supply Chain Resilience.

Status: data foundation in progress. See `docs/superpowers/specs/` for the design and `DATA-SOURCES-VERIFIED.md` for every data source.

## Setup
```
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync
make test
```

## Data sources and attribution

All data used by this project is public. Simulated values are labelled `source = simulated` everywhere they appear.

| Source | Provider | Licence | Use |
|---|---|---|---|
| HMIS (Health Management Information System) item-wise district monthly reports, FY 2017-18 to 2019-20 | Ministry of Health & Family Welfare, Government of India, via hmis.mohfw.gov.in | Government Open Data License - India (GODL) | Real district-level outpatient, inpatient, disease, immunisation counts and commodity stock ledgers |
| NFHS-5 district and state factsheets; RHS 2020-21 and 2021-22 facility counts; RHS 2021 staffing vacancies; Karnataka facility lists | data.gov.in (Open Government Data Platform India) | GODL | District indicators, PHC counts, staffing gaps |
| Rural Health Statistics 2016-17 to 2021-22; Health Dynamics of India 2022-23 and 2023-24 | Ministry of Health & Family Welfare | Government of India publication | Facility and staffing reference |
| Census of India 2011, Primary Census Abstract | Office of the Registrar General & Census Commissioner, India | Government of India publication | District population |
| National List of Essential Medicines 2022 | CDSCO, Ministry of Health & Family Welfare | Government of India publication | Commodity catalogue and PHC-level flags |
| Malaria, dengue and chikungunya situation tables | National Center for Vector Borne Diseases Control | Government of India publication | Disease context |
| Facility names and coordinates | © OpenStreetMap contributors, via Nominatim and Overpass API | Open Database License (ODbL) 1.0 | Real PHC, CHC and hospital names where mapped. The derived facility roster in `data/processed/facilities.parquet` is released under ODbL. |
| Weather history and forecast | Weather data by Open-Meteo.com | CC BY 4.0 | Rainfall and temperature features |
| Hospital beds and physicians per capita for BRICS countries | World Health Organization Global Health Observatory; The World Bank | CC BY-NC-SA 3.0 IGO; CC BY 4.0 | National baselines |
| Brazil: primary care units, facility-level medicine stock (BNAFAR/Hórus), dengue notifications | Ministério da Saúde, Brazil, via apidadosabertos.saude.gov.br | Brazilian government open data (Lei de Acesso à Informação) | Federated learning partner node; facility contact fields are stripped before use |

Weather data by Open-Meteo.com. Map data © OpenStreetMap contributors. This project is not affiliated with or endorsed by any of the providers above.
