# Track 3: Smart Health & Supply Chain Resilience
## Hack2Skill x Google BRICS Hackathon: master checklist, data sources, and research map

Last updated: 4 September 2026
Team: 2 people (both product and design managers)
Builder: an AI coding agent writes the code under the team's direction. Gemini is the AI inside the product. Google Cloud hosts it.

---

## 1. The brief, decoded

**BRICS theme:** Resilience

**The problem in one line:** India's Primary Health Centres (PHCs) have no live picture of medicine stock, beds, footfall, or staff attendance, so medicines run out in one district while sitting unused in the next, and the state cannot react fast enough during an outbreak.

**The challenge, broken into the five things judges will look for:**

| # | Requirement in the brief | What it means we must show |
|---|---|---|
| 1 | Real-time visibility into medicine stocks, bed availability, staff attendance | A live dashboard across every PHC in a district and state |
| 2 | Forecast demand | Per-drug, per-PHC demand prediction for the next 2 to 8 weeks |
| 3 | Early warnings for stock-outs during health emergencies | Days-of-stock alerts, with an outbreak mode that reprojects demand |
| 4 | Automated cross-district resource redistribution | Optimiser that proposes moving surplus to deficit, with route and reason |
| 5 | Shared predictive modelling across BRICS nations, federated | Federated learning: model weights shared, raw patient data never leaves the state or nation |

Point 5 is the differentiator most teams will skip. We do it properly.

---

## 2. Evaluation rubric and how we win each line

| Weight | Criterion | Judge's question | Our answer |
|---|---|---|---|
| 25% | AI / Technical Execution | Is Google AI doing meaningful work? Does it run end to end? | Gemini generates explanations, redistribution plans, reads paper registers, handles Hindi voice. Forecasting runs on Google infrastructure. The whole flow works live at a deployed link. |
| 20% | Problem-Solution Fit | Does it address the stated challenge directly? | Demo mirrors the five requirements above, one screen each. |
| 20% | Depth & Reach Across India | Can it scale from one state to communities across India? | Built on real HMIS and facility registry data. Shown working for two very different states. |
| 20% | Deployability & Scalability | Could a ministry pilot it in weeks? | Offline-first entry, Hindi voice, photo of paper register, plugs into e-Aushadhi and ABDM rather than replacing them. A written 4-week pilot plan. |
| 15% | Impact Potential | How many people, how many states, how meaningfully? | Quantified: number of PHCs, patients per year, percent of stock-outs avoidable, with sources. |

Your strengths as product and design managers cover 75% of this rubric. The technical 25% is handled by keeping the build small and real.

---

## 3. Timeline

| Milestone | Date | Notes |
|---|---|---|
| Hackathon launch | 11 Aug 2026 | Build window open since 10 Aug |
| Prototype submission closes | **30 Sep 2026** | 26 days from today |
| Prototype evaluation | 1 to 15 Oct 2026 | Deployed link must stay up the whole time |
| Top 20 shortlist announced | 16 Oct 2026 | |
| Virtual Demo Day | 23 Oct 2026 | Live demo if shortlisted |

---

## 4. Submission package checklist

- [ ] **Source code** in a public GitHub repository (or access granted to judges)
  - Repo: https://github.com/perkylizard/Smart-Health-Supply-Chain-Resilience (created 6 Sep, currently PRIVATE; switch to public before submission on 29 Sep)
  - [ ] README with problem, architecture diagram, setup steps, and a CREDITS section listing every open-source library and its licence (Rule 3)
  - [ ] Commit history dated inside the hackathon window (Rule 2 proof)
  - [ ] A note that the code was developed with AI-assisted tooling, if the FAQ asks for disclosure
- [ ] **Demo video**, 3 to 5 minutes, working end-to-end walkthrough
- [ ] **Pitch deck**, 10 to 12 slides: problem, solution, AI approach, who it serves, why it is deployable, how it scales across India
- [ ] **Brief description**, 2 to 3 lines
- [ ] **Deployed link**, live prototype on Google Cloud, stable through 15 Oct

**Build requirements the rules demand (all must be visible in the demo):**

- [ ] A functioning end-to-end flow for the core use case
- [ ] Google AI integration (GenAI plus predictive modelling)
- [ ] Real or realistic data, with simulated data clearly labelled and grounded in public statistics
- [ ] Built for India: scales across states, not one city
- [ ] Multilingual or voice support (Hindi voice entry for PHC staff)

---

## 5. Rules and what they mean for us

| Rule | Implication |
|---|---|
| 1. Must integrate Google AI | All runtime AI is Gemini or Vertex. No non-Google AI calls inside the product, ever. |
| 2. Build during the hackathon | Fresh repo, first commit after 10 Aug. Keep history public. |
| 3. Original code, cite reuse | All code is original team work. Every library cited with licence in README. |
| 4. Cross-border applicability | The federated learning demo is our answer. Built for India, proven with a second state or nation. |
| 5. Respectful conduct | Standard. |
| 6. Judges' decisions final | Standard. |

---

## 6. Working model for a two-person product team

**Build with an AI agent, think with Gemini, deploy on Google.**

| Who | Owns |
|---|---|
| You (both) | The story: field reality of a PHC, the district officer persona, pilot plan, impact numbers, deck, video script, judge Q&A prep |
| You (both) | The UX: dashboard, alert flow, PHC staff entry flow. Designed in Figma or Pencil, then implemented exactly |
| AI coding agent | All code: data simulator, forecasting, alerts, redistribution optimiser, federated demo, Gemini integration, deployment |
| Gemini | The intelligence inside the product at runtime |
| Google Cloud | Hosting, database, model serving |

Principle: **fake nothing silently.** Simulated data is labelled as simulated and grounded in real HMIS numbers. Judges respect honesty and it protects you in Q&A.

---

## 7. Solution blueprint (Approach 1, recommended)

One Python backend, one dashboard, Gemini in the middle.

### Components

| # | Component | What it does | Tech |
|---|---|---|---|
| 1 | Facility registry | Every PHC with district, state, coordinates | Real data from ABDM HFR / NIN, loaded into Firestore |
| 2 | Data simulator | Generates realistic daily stock, footfall, beds, attendance per PHC, seeded from real HMIS statistics, with scenario switches (normal, monsoon outbreak, festival surge) | Python |
| 3 | Data store | Live state and history | Firestore (live), BigQuery (history and analytics) |
| 4 | Forecasting engine | Demand per drug per PHC, 2 to 8 weeks ahead, using seasonality, footfall trend, disease signal, weather | BigQuery ML ARIMA_PLUS first; Vertex AI Forecasting later if credits allow |
| 5 | Early-warning engine | Days-of-stock remaining, threshold alerts, outbreak multiplier | Python rules on top of forecast |
| 6 | Redistribution optimiser | Transport problem: surplus to deficit within distance and cost limits | Google OR-Tools plus Maps Platform Distance Matrix |
| 7 | Federated learning demo | Two simulated states (or India plus Brazil) train locally, share only weights, averaged model beats either local model | Flower framework |
| 8 | Gemini layer | Natural-language questions from the officer, plain-English alert explanations, redistribution reasoning, weekly report generation, reading a photo of a paper stock register | Gemini API (text plus vision) |
| 9 | Voice and language | PHC staff update stock by speaking in Hindi | Cloud Speech-to-Text, Translation API |
| 10 | Dashboard | State view, district view, PHC map, alerts feed, redistribution proposals, federated panel | React on Firebase Hosting |
| 11 | Alerting | Message to PHCs on approved redistribution | WhatsApp-style mock, or Twilio if time allows |
| 12 | Backend API | Ties it together | FastAPI on Cloud Run |

### Hero scenario (draft, to be finalised)

1. District officer opens the district view. Map mostly green, a few amber.
2. Switch on "monsoon outbreak" scenario. Diarrhoea case counts rise in three blocks.
3. Forecast reprojects demand. Three PHCs flip red: ORS and zinc run out in 5 to 7 days.
4. Gemini explains each alert and proposes redistribution from two nearby PHCs with route, quantity, and reason.
5. Officer approves with one click. Message goes to both PHCs.
6. Federated panel: the model was trained across two states without pooling patient data.

### Open decisions (to settle before Section 2 of the design)

- [x] Primary demo state: **Bihar** (decided 6 Sep)
- [x] Demo set (13 units, decided 6 Sep): Bihar (hero), Uttar Pradesh, Rajasthan, Madhya Pradesh, Andhra Pradesh, Telangana, Karnataka, Arunachal Pradesh, Jammu & Kashmir, Ladakh (Leh + Kargil, carved out of J&K files for 2017-19), Lakshadweep, Andaman & Nicobar, Bastar division of Chhattisgarh (tribal region, 7 districts). National map still covers all 36 states/UTs.
- [ ] Federated partner: OPEN. Options: Brazil (real open stock data, recommended by the build agent, not yet confirmed), India-only two-state federation (e.g. Bihar + Assam), another BRICS nation (simulated node), or a combination.
- [ ] Which drugs to track (suggestion: 15 to 20 from NLEM covering outbreak, chronic, maternal)
- [ ] Bed availability: include in simulator, or focus on medicines and staff

---

## 8. Google stack (from the hackathon's recommended tools page)

| Need | Google tool | Cost status |
|---|---|---|
| Generative AI, vision | Gemini API via Google AI Studio | Free tier, no card |
| Predictive modelling | BigQuery ML, Vertex AI | Needs billing account (free trial covers it) |
| Voice, language | Cloud Speech-to-Text, Translation API | Free monthly allowance, needs billing |
| Geospatial | Google Maps Platform (Distance Matrix, Maps JS) | Free monthly credit, needs billing |
| Database | Firestore (Firebase Spark plan) | Free, no card |
| Hosting | Firebase Hosting | Free, no card |
| Backend | Cloud Run | Needs billing, free allowance generous |
| Analytics | BigQuery | Free 1 TB queries per month, needs billing |

**Accounts to set up this week:**

- [ ] Google AI Studio account and Gemini API key: https://aistudio.google.com
- [ ] Google Cloud free trial (300 USD, 90 days, card for identity only): https://cloud.google.com/free
- [ ] Firebase project (Spark plan): https://console.firebase.google.com
- [ ] Email organisers to confirm Google AI Studio and Vertex AI credit details for registered teams (the tools page says these are pending)
- [ ] If any of you are in a Google Developer Group chapter, ask the organiser about cloud credit codes
- [ ] GitHub organisation or repo for the team
- [ ] Figma or Pencil file for UX

---

## 9. Public data sources

### India: facilities and infrastructure

| Dataset | What you get | Where |
|---|---|---|
| Rural Health Statistics (RHS), MoHFW | Annual counts of sub-centres, PHCs, CHCs, doctors, staff shortfall by state | https://main.mohfw.gov.in (Statistics section) and https://data.gov.in |
| ABDM Health Facility Registry | Searchable list of registered health facilities | https://facility.abdm.gov.in |
| National Health Facility Registry (NIN) | Facility list with unique IDs and location | https://nin.nhp.gov.in |
| Open Government Data portal | Many health datasets; search "PHC", "health facility", "hospital beds" | https://data.gov.in |
| Bihar Medical Services and Infrastructure Corporation (BMSICL) | Bihar's drug procurement body, if Bihar is the demo state | https://bmsicl.gov.in |

### India: utilisation and disease trends

| Dataset | What you get | Where |
|---|---|---|
| HMIS (Health Management Information System) | Monthly facility-level outpatient, inpatient, delivery, immunisation numbers. Excel downloads by state and district. Best source for realistic footfall. | https://hmis.mohfw.gov.in |
| IDSP (Integrated Disease Surveillance Programme) | Weekly outbreak reports as PDFs. Basis for outbreak scenarios. | https://idsp.mohfw.gov.in |
| NFHS-5 district factsheets | Disease burden, demographics, health access | https://rchiips.org/nfhs |
| NCVBDC (formerly NVBDCP) | Malaria, dengue, chikungunya cases by state | https://ncvbdc.mohfw.gov.in |
| Census 2011 and projections | District population for normalising demand | https://censusindia.gov.in |

### India: medicines and stock

| Dataset | What you get | Where |
|---|---|---|
| National List of Essential Medicines (NLEM 2022) | The drug catalogue for the product | https://main.mohfw.gov.in (search NLEM 2022 PDF) |
| Tamil Nadu Medical Services Corporation (TNMSC) | The gold-standard PHC drug supply model in India; stock and procurement info | https://tnmsc.tn.gov.in |
| Rajasthan Medical Services Corporation (RMSCL) | Another well-run state drug supply system | https://rmsc.rajasthan.gov.in |
| e-Aushadhi / DVDMS | The drug distribution system most states use; public dashboards vary by state | Search "<state> e-Aushadhi DVDMS" |
| Jan Aushadhi | Product list and prices | https://janaushadhi.gov.in |

### Environmental signals for forecasting

| Dataset | What you get | Where |
|---|---|---|
| IMD (India Meteorological Department) | Rainfall and temperature | https://mausam.imd.gov.in |
| Open-Meteo | Free historical weather API, easiest to integrate | https://open-meteo.com |

### Historic bed availability

| Dataset | What you get | Where |
|---|---|---|
| COVID-19 era state bed dashboards, archived on Kaggle | Only public time series of bed occupancy in India | Search Kaggle for "India hospital beds COVID" |

### BRICS and federated partner data

| Dataset | What you get | Where |
|---|---|---|
| Brazil DATASUS | Fully open hospital and outpatient data. Best partner for a two-nation federated demo. | https://datasus.saude.gov.br |
| DHIS2 public demo | Realistic health information system data used by South Africa and many others | https://play.dhis2.org |
| WHO Global Health Observatory | Country-level health indicators for all BRICS nations | https://www.who.int/data/gho |
| World Bank health indicators | Beds per 1000, physicians per 1000, health spend | https://data.worldbank.org |

---

## 10. Research map

### Domain: how PHC drug supply actually works
- [ ] The monthly indent and passbook system at PHC level
- [ ] District warehouse to PHC flow, state medical services corporations
- [ ] The TNMSC model: why Tamil Nadu has fewer stock-outs than other states
- [ ] WHO "Managing Drug Supply" guidance: min-max inventory, days-of-stock, reorder points
- [ ] Bihar's specific supply chain (BMSICL) if Bihar is the demo state

### Existing government systems (so the pilot plan plugs in, not replaces)
- [ ] HMIS: what data it already captures and how often
- [ ] e-Aushadhi / DVDMS: what it tracks and where it stops
- [ ] ABDM (Ayushman Bharat Digital Mission): facility registry, health IDs, consent framework
- [ ] eSanjeevani, U-WIN: adjacent systems judges may ask about

### Evidence for impact numbers
- [ ] PubMed and Google Scholar: "stock-out primary health centre India"
- [ ] Studies on essential medicine availability in Indian PHCs (percent of days stocked out)
- [ ] Cost of stock-outs: patients pushed to private pharmacies, out-of-pocket spend
- [ ] Total PHCs, total annual PHC footfall (from RHS and HMIS) to size the benefit

### AI and technical
- [ ] Federated learning: Flower framework docs (https://flower.ai), TensorFlow Federated tutorials, Google's federated averaging paper (McMahan et al., 2017)
- [ ] Gemini API: text, vision, structured output, function calling (https://ai.google.dev)
- [ ] BigQuery ML ARIMA_PLUS for time series forecasting
- [ ] Vertex AI Forecasting (only if credits and time allow)
- [ ] Google OR-Tools for the transport problem (https://developers.google.com/optimization)
- [ ] Maps Platform Distance Matrix API
- [ ] Cloud Speech-to-Text with Hindi (hi-IN) and other Indian languages

### Hackathon specifics
- [ ] Read the full FAQ for AI-assisted development disclosure policy
- [ ] Confirm judging format for Demo Day (live screen share or pre-recorded)
- [ ] Confirm whether judges get repo access or only the deployed link
- [ ] Attend or watch the recording of the 14 Aug Problem Statement Explainer Session
- [ ] Find past Hack2Skill winners' decks for format cues

### BRICS angle
- [ ] Brazil's SUS (public health system) structure, to make the partner story credible
- [ ] Cross-border data sharing constraints (why federated matters: data sovereignty laws)
- [ ] India's Digital Personal Data Protection Act 2023 implications for health data

---

## 11. Week-by-week plan (26 days)

| Week | Dates | Builder (AI coding agent) | Team (you two) |
|---|---|---|---|
| 1 | 4 to 10 Sep | Finish design spec. Facility registry loaded. Data simulator with scenarios. Local dashboard skeleton. | Accounts and credits set up. Domain research (Sections 10.1 and 10.2). Persona and hero scenario locked. Figma wireframes. |
| 2 | 11 to 17 Sep | Forecasting, early warnings, redistribution optimiser. Gemini explanations and NL query. Deploy first version to Cloud Run and Firebase. | Impact numbers researched. Dashboard visual design finalised. Deck outline. |
| 3 | 18 to 24 Sep | Federated demo. Hindi voice entry. Register photo reading. Polish UI to design. | Deck draft. Video script and storyboard. Test the live link as a judge would. |
| 4 | 25 to 30 Sep | Bug fixes, README, CREDITS, stability of deployed link. Freeze by 28 Sep. | Record video. Finalise deck and description. Submit by 29 Sep, one day early. |
| Buffer | 1 to 22 Oct | Keep link alive. Prepare for Demo Day questions. | Rehearse the 5-minute live demo. Prepare judge Q&A sheet. |

---

## 12. Next step

Confirm Section 1 of the design (users, hero scenario, demo state), then the design walkthrough continues with:

- Section 2: data model and simulator
- Section 3: the AI pieces (forecast, warning, redistribution, federated, Gemini)
- Section 4: dashboard and PHC staff flows
- Section 5: deployment and testing plan

After all sections are approved, the spec is written to `docs/design/specs/` and turned into an implementation plan.
