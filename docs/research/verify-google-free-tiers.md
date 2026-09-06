# Google APIs: free-tier and pricing verification for the hackathon prototype

Verified on 2026-09-05 against official Google documentation only (ai.google.dev, cloud.google.com / docs.cloud.google.com, firebase.google.com, developers.google.com). No API calls were made. Every figure below was read on the page cited; "date read" is 2026-09-05 unless noted, and the page's own "Last updated" footer is given where one exists. Where a page could not be read or a figure was not on it, the item is listed at the end under "Unverified or ambiguous items" rather than guessed.

Conventions: "card required" refers to whether a payment method must be attached before the free allowance can be used at all.

---

## 1. Gemini API via Google AI Studio (ai.google.dev)

**What is free**
- A Free usage tier exists: qualification is simply "Active project or free trial"; billing-tier cap "N/A". Tier 1 requires "Set up and link an active billing account". Source: https://ai.google.dev/gemini-api/docs/rate-limits (Last updated 2026-09-02).
- Pricing page header: "Start building free of charge with generous limits ... Free: Limited access to certain models; Free input & output tokens; Google AI Studio access; Content used to improve our products." Source: https://ai.google.dev/gemini-api/docs/pricing (Last updated 2026-09-04).

**Models on the Free tier right now (Standard-row "Input price = Free of charge" on the pricing page, 2026-09-04)**
Text/multimodal: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`.
Audio/speech: `gemini-3.5-transcribe`, `gemini-3.5-transcribe-live`, `gemini-3.5-live-translate-preview`, `gemini-3.1-flash-live-preview`, `gemini-2.5-flash-native-audio-preview-12-2025`, `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`.
Embeddings: `gemini-embedding-001` (Free of charge). Also Gemma 4 (free).
NOT on Free tier ("Not available"): `gemini-3.1-pro-preview` / Gemini 3.1 Pro, Gemini Omni Flash (`gemini-omni-1.1-flash`), all image-generation models (`gemini-3.1-flash-image`, `gemini-3-pro-image`, `gemini-2.5-flash-image`), `gemini-2.5-pro-preview-tts`, `gemini-2.5-computer-use-preview-10-2025`. Grounding with Google Search / Maps is "Not available" on Free tier for all models.
Paid Standard prices (per 1M tokens, USD): gemini-3.8-flash $0.75 in / $3.75 out through 2026-12-31 (rises to $1.50 / $7.50 from 2027-01-01); gemini-3.5-flash $1.50 / $9.00; gemini-3.5-flash-lite $0.30 / $2.50; gemini-3.1-flash-lite $0.25 (text/image/video), $0.50 (audio) / $1.50; gemini-2.5-flash $0.30 (+$1.00 audio) / $2.50; gemini-2.5-flash-lite $0.10 (+$0.30 audio) / $0.40; gemini-2.5-pro $1.25 / $10.00 (<=200k prompt).
Source: https://ai.google.dev/gemini-api/docs/pricing (Last updated 2026-09-04).

**Rate limits (RPM / TPM / RPD)**
- The rate-limits page no longer publishes a per-model Free-tier RPM/TPM/RPD table. It says: "Rate limits depend on a variety of factors (such as your usage tier) and can be viewed in Google AI Studio", "Rate limits are applied per project, not per API key. Requests per day (RPD) quotas reset at midnight Pacific time", "Rate limits are more restricted for experimental and preview models", and "Specified rate limits are not guaranteed and actual capacity may vary." Spend-based limit for Free tier: N/A; Tier 1: $10 per rolling 10 minutes. Source: https://ai.google.dev/gemini-api/docs/rate-limits (Last updated 2026-09-02). Exact numbers: see Unverified list.

**Card required:** No for Free tier ("Active project or free trial"). Yes to move to Tier 1 ("set up billing in AI Studio"; upgrade "will typically take effect instantly"). Same source.

**Training / privacy (important for a health demo)**
- Pricing page, every Free-tier column: "Used to improve our products: Yes"; Paid tier: "Content not used to improve our products".
- Terms, Unpaid Services: Google uses content "to provide, improve, and develop Google products and services" including ML, and "Human reviewers may read, annotate, and process your API input and output" (data disconnected from account/API key before review). Paid Services: "Google doesn't use your prompts ... or responses to improve our products"; logged only for abuse detection / legal compliance.
- Terms also: "Don't rely on the Services for medical, mental health, legal, financial, or other professional advice" and you "may not use the Services in clinical practice, to provide medical advice, or in any manner that is overseen by or requires clearance from a medical device regulatory agency."
- Source: https://ai.google.dev/gemini-api/terms (effective 2026-03-23; page Last updated 2026-04-28) and https://ai.google.dev/gemini-api/docs/pricing (2026-09-04).

**India availability:** Yes. India appears in the list on https://ai.google.dev/gemini-api/docs/available-regions (Last updated 2026-04-28). Users must be 18+ with age verified on the Google Account. Terms: Paid Services only when serving end users in EEA/Switzerland/UK (not relevant to India).

**Vision (image input):** "all Gemini model versions are multimodal"; every Gemini 3.x Flash / Flash-Lite and 2.5 Flash / Flash-Lite / Pro model lists Text, Image, Video, Audio inputs. Formats PNG, JPEG, WEBP, HEIC, HEIF; max 3,600 images per request; 258 tokens per image <=384px (tiled at 768x768 above that). Sources: https://ai.google.dev/gemini-api/docs/image-understanding (2026-09-02), https://ai.google.dev/gemini-api/docs/models (2026-09-04).

**Structured JSON output:** Supported on the Gemini models generally (examples use `gemini-3.8-flash`); the models page marks structured output "Yes" for gemini-3.8/3.7/3.6/3.5-flash, 3.5-flash-lite, 3.1-flash-lite. Combining structured output with built-in tools is "available only to Gemini 3 series models". Sources: https://ai.google.dev/gemini-api/docs/structured-output (2026-09-02), https://ai.google.dev/gemini-api/docs/models (2026-09-04).

**Audio input directly (Hindi voice without a separate STT call):** Yes. Audio accepted inline (<20 MB request) or via Files API; formats wav, mp3, aiff, aac, ogg, flac, mpeg, m4a, l16, opus, alaw, mulaw, webm; 32 tokens per second (1 min = 1,920 tokens); up to 9.5 hours per prompt; audio downsampled to 16 kbps mono. Multilingual transcription/translation is shown ("Detect the primary language of each segment ... provide the English translation"); Hindi is not named specifically on that page. Dedicated `gemini-3.5-transcribe` and `gemini-3.5-transcribe-live` (Audio -> Text) are stable and Free of charge on the free tier. Sources: https://ai.google.dev/gemini-api/docs/audio (2026-09-02), https://ai.google.dev/gemini-api/docs/models (2026-09-04), https://ai.google.dev/gemini-api/docs/pricing (2026-09-04).

**Recommendation (26-day build):** Use the Gemini API free tier with `gemini-3.5-flash-lite` or `gemini-2.5-flash-lite` for bulk calls and `gemini-3.8-flash` for the demo's hardest prompts; send Hindi audio straight to Gemini (or `gemini-3.5-transcribe`) and skip Cloud STT. Use only synthetic/de-identified health data on the free tier because prompts are used for product improvement and may be human-reviewed; read your live RPM/RPD in AI Studio on day 1 and build a retry/backoff around 429s.

---

## 2. Google Cloud Free Trial

- Credit: "$300 in Welcome credit to spend over 90 days".
- Card: Yes. "During the sign up, you must provide a credit card or other payment method that is valid for the period of the Free Trial. Depending on your country, you might also need to verify your bank account." A $0-$1 authorization hold is placed, not a charge.
- Auto-charge at end: No. "If you don't upgrade to a Paid billing account before 90 days pass or if you spend the $300 in free credit, then your Free Trial billing account will be closed"; resources stop; 30-day window to recover before deletion. Upgrading is a manual action.
- Eligibility: never a paying user of Google Cloud, Google Maps Platform, or Firebase, and never signed up for the trial before. No India-specific restriction is stated on the page; only "Depending on your country, you might also need to verify your bank account."
- Source: https://docs.cloud.google.com/free/docs/free-cloud-features (Last updated 2026-08-26); cloud.google.com/free/docs/free-cloud-features 301-redirects there.

**Recommendation:** Activate the trial on a fresh account only when you need billed services (Cloud Run functions, Maps, Speech-to-Text, Vertex); $300/90 days comfortably covers a 26-day build and it will not auto-charge.

---

## 3. Google Cloud Always Free tier (monthly, per billing account)

Requires a Cloud Billing account (Paid or Free Trial) in good standing: "To use products that have a Free Tier, you need a Google Cloud billing account." Allowances are available "during and after the free trial period".

| Product | Monthly free allowance |
|---|---|
| Cloud Run | 2 million requests; 360,000 GB-seconds memory; 180,000 vCPU-seconds |
| Cloud Run functions (Cloud Functions) | 2 million invocations; 400,000 GB-seconds; 200,000 GHz-seconds; 5 GB egress |
| Firestore | 1 GB storage; 50,000 reads, 20,000 writes, 20,000 deletes per day |
| BigQuery | 1 TiB of query processing; 10 GiB storage (BigQuery ML models and training data stored in BigQuery count inside this storage allowance) |
| Compute Engine | 1 e2-micro (US regions only: us-east1/us-west1/us-central1); 30 GB-months disk |
| Cloud Storage | 5 GB-months regional (US regions only); 5k Class A, 50k Class B ops; 100 GB egress |

Sources: https://docs.cloud.google.com/free/docs/free-cloud-features (2026-08-26); BigQuery rows also on https://cloud.google.com/bigquery/pricing (no page date; read 2026-09-05).

**Recommendation:** Cloud Run + Firestore + BigQuery all fit inside Always Free for a demo-scale app; keep BigQuery scans small (SELECT only needed columns) and you will not touch the 1 TiB.

---

## 4. Firebase Spark plan (no card)

- Spark: "No payment method needed". Blaze: payment method required; "No-cost usage from Spark plan included".
- Hosting (Spark): 10 GB storage, 360 MB/day transfer, custom domain and SSL included.
- Cloud Firestore (Spark): 1 GiB storage, 50K reads / 20K writes / 20K deletes per day.
- Authentication (Spark): 50K monthly active users (50 MAU for SAML/OIDC).
- Realtime Database (Spark): 100 simultaneous connections, 1 GB stored, 10 GB/month download.
- Cloud Functions: NOT available on Spark; Blaze gives 2M invocations/month free then $0.40/million. Confirmed on the Functions docs: "You can emulate functions in any Firebase project, but to deploy functions, your project must be on the Blaze pricing plan."
- Cloud Storage for Firebase: not offered on Spark (Blaze only; 5 GB no-cost on legacy buckets).
- Sources: https://firebase.google.com/pricing (no page date shown; read 2026-09-05); https://firebase.google.com/docs/functions/get-started (no page date; read 2026-09-05).

**Recommendation:** Host the front end and use Firestore + Auth on Spark with zero card; if you need server code, deploy it on Cloud Run (Always Free) or upgrade the same project to Blaze (still $0 within the no-cost tier) rather than fighting the Spark restriction.

---

## 5. BigQuery ML: ARIMA_PLUS

- ARIMA_PLUS exists (univariate time-series; `ARIMA_PLUS_XREG` for exogenous regressors). Key options: TIME_SERIES_TIMESTAMP_COL, TIME_SERIES_DATA_COL, TIME_SERIES_ID_COL (string or array), HORIZON (default 1,000, max 10,000), HOLIDAY_REGION, AUTO_ARIMA, AUTO_ARIMA_MAX_ORDER, FORECAST_LIMIT_LOWER/UPPER_BOUND, MIN/MAX_TIME_SERIES_LENGTH. "You can forecast up to 100,000,000 time series simultaneously with a single query by using the TIME_SERIES_ID_COL". Source: https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/bigqueryml-syntax-create-time-series (no footer date captured; read 2026-09-05).
- Billing (on-demand): ARIMA_PLUS is a "built-in" model. CREATE MODEL for built-in models (logistic/linear regression, k-means, PCA, time series, contribution analysis) is billed at **$312.50 per TiB** of bytes processed, labelled `bqml_arima_plus_training`. With AUTO_ARIMA the bytes are multiplied by the number of candidate models: (6, 12, 20, 30, 42) for AUTO_ARIMA_MAX_ORDER (1..5) when d=1, or (3, 6, 10, 15, 21) otherwise; with TIME_SERIES_ID_COL always (6, 12, 20, 30, 42). Evaluation, inspection and prediction (ML.FORECAST etc.) are billed as ordinary queries at $6.25/TiB and "are included in the 1 TiB of data per month under the BigQuery analysis free tier."
- Is CREATE MODEL in the free tier? The pricing page's Free Tier table lists only Storage (10 GiB) and Queries (1 TiB). No free allowance for built-in CREATE MODEL bytes is stated on the page read; treat model training as billable (at $312.50/TiB a model over a few MB of data costs a fraction of a cent, e.g. 100 MB x 42 candidates = 4.2 GB = about $1.28). Source: https://cloud.google.com/bigquery/pricing (read 2026-09-05; no page date).
- No-card option: "You can try BigQuery's free tier in the BigQuery sandbox without a credit card" (sandbox: 10 GiB lifetime storage, 1 TiB/month query, tables expire by default). Source: https://docs.cloud.google.com/bigquery/docs/sandbox (read 2026-09-05).
- Alternative without training: `AI.FORECAST()` uses BigQuery ML's built-in TimesFM (2.0 or 2.5, default 2.5) with no model creation; "AI.FORECAST usage is billed at the evaluation, inspection, and prediction rate" (i.e. $6.25/TiB inside the 1 TiB free query allowance). Source: https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/bigqueryml-syntax-ai-forecast (Last updated 2026-08-26).

**Recommendation:** Prototype forecasting with `AI.FORECAST` (TimesFM) first because it runs inside the free 1 TiB query allowance with no training job; use ARIMA_PLUS with a small AUTO_ARIMA_MAX_ORDER (1-2) and a billing-enabled project if you need explicit seasonality/holiday modelling; total spend on demo-sized data will be cents.

---

## 6. Vertex AI Forecasting (AutoML)

- Status: still exists, now documented under the rebranded "Gemini Enterprise Agent Platform" ("Vertex AI's services are now part of Gemini Enterprise Agent Platform"). The forecasting overview page ("Forecasting with AutoML") is live with the 5-step workflow and the training page lists four methods: AutoML (L2L), Seq2Seq+, Temporal Fusion Transformer (TFT), Time series Dense Encoder (TiDE). Training budget is set in milli node hours; the SDK sample default is `budget_milli_node_hours=8000` (8 node hours). "Forecasting with AutoML doesn't support online inferences" (batch only; use Tabular Workflow for Forecasting for online). Sources: https://docs.cloud.google.com/vertex-ai/docs/tabular-data/forecasting/overview (read 2026-09-05), https://docs.cloud.google.com/vertex-ai/docs/tabular-data/forecasting/train-model (Last updated 2026-09-02).
- Deprecations page lists only "Legacy AutoML Tables" (deprecated 2023-01-23, shut down 2024-07-24, migrate to Vertex AI). No deprecation for Vertex AutoML forecasting, Tabular Workflows, or time-series models. Source: https://docs.cloud.google.com/vertex-ai/docs/deprecations (Last updated 2026-08-26).
- Replacement direction: TimesFM (foundation model, versions 1.0/2.0/2.5) is offered in Model Garden and embedded in BigQuery `AI.FORECAST`; this is additive, not a formal deprecation. Source: search results on cloud.google.com / docs.cloud.google.com (Model Garden overview https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models; BigQuery blog). Console model card not fetched.
- Cost: AutoML forecasting training **$21.252 per node hour** (list price); classification/regression training also $21.252/node hour; forecasting prediction $0.20 per 1,000 data points (first 1M), $0.10 (1M-50M), $0.02 above; up to 5 quantiles free. A "small" job at the SDK's default 8-node-hour budget is therefore about $170 list (1 node hour = about $21). Source: https://cloud.google.com/vertex-ai/pricing (read 2026-09-05; no page date; page now titled "Gemini Enterprise Agent Platform pricing").
- Card: Yes (Vertex AI has no no-card path; requires a billing-enabled project).

**Recommendation:** Do not use Vertex AutoML forecasting for a 26-day hackathon; one default-budget job burns more than half the $300 trial. Use BigQuery `AI.FORECAST` (TimesFM) or ARIMA_PLUS, and mention TimesFM/Vertex as the "scale-up path" in the pitch.

---

## 7. Cloud Speech-to-Text and Cloud Translation

**Speech-to-Text**
- Free minutes: V1 API "Speech Recognition (with data logging)" and "(without data logging)" both list "0 minute to 60 minute: $0.00 (Free)" per month, then $0.016/min (with logging) or $0.024/min (without logging). The V2 API "Recognition" row starts at $0.016/min from minute 0 with no free bracket shown; V2 dynamic batch is $0.003/min. Standard models named on the page: default, command_and_search, latest_short, latest_long, phone_call, video, chirp (V2 only). Medical models $0.078/min after 60 free minutes. Source: https://cloud.google.com/speech-to-text/pricing (read 2026-09-05; no page date).
- Hindi: hi-IN supported on chirp_3, chirp_2, chirp, long, short, telephony, telephony_short. Other Indian languages on Chirp models: Tamil, Telugu, Marathi, Kannada, Gujarati, Malayalam, Punjabi (pa-Guru-IN) on chirp/chirp_2/chirp_3; Bengali (bn-IN) on chirp_2/chirp_3 only. Source: https://docs.cloud.google.com/speech-to-text/v2/docs/speech-to-text-supported-languages (read 2026-09-05; no page date).
- Card: Yes (Cloud billing account needed to enable the API).

**Cloud Translation**
- Free: "First 500,000 characters per month: Free (applied as $10 credit every month)"; the $10 credit is shared across Basic and Advanced and does not roll over; not applicable to formatted document translation. After that $20 per million characters (NMT/Basic/Advanced), Translation LLM $10/M input + $10/M output, Adaptive Translation $25/M. Source: https://cloud.google.com/translate/pricing (read 2026-09-05; no page date).
- Card: Yes (billing account).

**Recommendation:** Skip Cloud STT and Translation for the prototype; Gemini handles Hindi audio and translation on the free tier without a card. Keep Cloud STT (chirp_3, hi-IN) as a fallback only if Gemini transcription quality on your test clips is not acceptable; 60 free V1 minutes or a few dollars on V2 covers demo use.

---

## 8. Google Maps Platform

- Pricing model: "Free usage caps replace monthly $200 credit" effective **March 1, 2025**. Each SKU gets free monthly billable events by price category. Global list: Essentials 10,000 / Pro 5,000 / Enterprise 1,000 free events per SKU per month. Sources: https://developers.google.com/maps/billing-and-pricing/overview (Last updated 2026-09-01), https://developers.google.com/maps/billing-and-pricing/pricing (Last updated 2026-09-01).
- India price list (applies to billing accounts linked to India, effective 2024-08-01, quoted in USD): free caps are much higher: Essentials 70,000 / Pro 35,000 / Enterprise 7,000 events per SKU per month; Distance Matrix (Legacy) and Routes: Compute Route Matrix Essentials $1.50 per 1,000 after 70k free (down to $0.38/1,000 at 5M+). Source: https://developers.google.com/maps/billing-and-pricing/pricing-india (Last updated 2026-09-01).
- Global Distance Matrix (Legacy) Essentials: 10,000 free, then $5.00/1,000 (10,001-100,000), $4.00/1,000 above; Pro: 5,000 free, $10.00/1,000 then $8.00. Routes: Compute Routes Essentials 10,000 free then $5.00 down to $0.38/1,000. Source: https://developers.google.com/maps/billing-and-pricing/pricing (2026-09-01).
- Card: Yes. "Make sure that billing is enabled for your Cloud project" and "While you must set up a billing account to set up a Cloud project, actual usage ... is available at no charge" (free caps + $300 welcome credit). Source: https://developers.google.com/maps/get-started (Last updated 2026-09-01).

**Recommendation:** Attach billing (trial card) and use Routes: Compute Route Matrix or Distance Matrix under the India price list's 70,000 free events/month; set a daily quota cap in the console so a demo loop cannot exceed the free bucket.

---

## 9. Google OR-Tools

- Licence: Apache License, Version 2.0 (the LICENSE file in Google's official repository google/or-tools begins "Apache License Version 2.0, January 2004"). The developers.google.com pages describe OR-Tools as "open source software for combinatorial optimization" and state code samples are Apache 2.0, but do not print the library licence name themselves. Sources: https://raw.githubusercontent.com/google/or-tools/stable/LICENSE (read 2026-09-05), https://developers.google.com/optimization/introduction (Last updated 2024-08-28).
- pip package: `ortools` -- "python -m pip install ortools". Source: https://developers.google.com/optimization/install (Last updated 2026-03-18).
- Card required: No. Free, runs locally.

**Recommendation:** Use `ortools` (CP-SAT or the routing solver) locally or inside Cloud Run for allocation/routing; it costs nothing and has no quota.

---

## 10. AI Studio / Gemini API terms: hackathon, commercial use, data residency

- Commercial use on the free tier: no clause prohibits it. Terms say "Use of Google AI Studio and Gemini API is for developers building with Google AI models for professional or business purposes, not for consumer use." No hackathon-specific clause exists in the terms. Pricing page positions Free as "For developers and small projects getting started" and Paid "For production applications". Restrictions that matter for this project: medical-advice / clinical-practice prohibition (see item 1); Paid Services only when your app is offered to end users in EEA, Switzerland or UK; agentic use requires "judgment and supervision when and if the service is used in production environments". Source: https://ai.google.dev/gemini-api/terms (effective 2026-03-23; Last updated 2026-04-28).
- Data residency: the Gemini Developer API offers no region selection; terms state data "may be stored transiently or cached in any country in which Google or its agents maintain facilities". Zero Data Retention (ZDR) is available on Paid Services only, via approval request, with 30-day retention exceptions for Grounding with Google Search/Maps; the ZDR page points to Gemini Enterprise Agent Platform (Vertex) for "enterprise-grade, self-serve ZDR controls" and contains no data-residency/region information. Sources: https://ai.google.dev/gemini-api/terms (2026-04-28), https://ai.google.dev/gemini-api/docs/zdr (Last updated 2026-05-28).

**Recommendation:** Frame the demo as a decision-support tool for supply/logistics staff (not clinical advice) to stay inside the terms; use synthetic data, no real PHI, on the free tier; if judges ask about residency, answer that the production path is Vertex AI (Agent Platform) in an Indian region, not the Developer API.

---

## Unverified or ambiguous items

1. **Gemini free-tier numeric limits (RPM / TPM / RPD per model).** The official rate-limits page (https://ai.google.dev/gemini-api/docs/rate-limits, 2026-09-02) no longer prints a per-model Free-tier table; it says to "View your active rate limits in AI Studio". Numbers cannot be verified without signing into AI Studio. Only the tier qualifications and the spend-based limits were verifiable.
2. **Gemini free tier availability specifically for India.** India is on the available-regions list, and nothing on the pricing or terms pages restricts the Free tier by country (other than EEA/CH/UK requiring Paid). The absence of a restriction is what was verified, not an explicit "free tier available in India" sentence.
3. **BigQuery ML CREATE MODEL free allowance.** No free bytes-processed allowance for built-in model creation appears in the Free Tier table on https://cloud.google.com/bigquery/pricing as read; if a separate free allowance exists elsewhere it was not found. Treat ARIMA_PLUS training as billable at $312.50/TiB.
4. **ARIMA_PLUS hard limits** (max rows, max series count beyond the 100,000,000 statement, page date). The page footer date was not captured by the fetch; the option defaults/maxima quoted come from the page body.
5. **Speech-to-Text V2 free minutes and Chirp 2 / Chirp 3 pricing rows.** The pricing page as read shows a 60-minute free bracket only in the V1 tables; the V2 "Recognition / Standard" row starts at $0.016 from minute 0 and the page names "chirp" but no separate chirp_2 / chirp_3 price rows. Whether V2 has an unlisted free bracket or separate Chirp 2/3 SKUs is ambiguous. URL: https://cloud.google.com/speech-to-text/pricing.
6. **Firebase pricing page date** and the Cloud Speech supported-languages page date: neither page exposes a "Last updated" footer; figures are as read 2026-09-05.
7. **Vertex AI Forecasting minimum training budget.** The train-model page defines TRAINING_BUDGET in milli node hours and the SDK default is 8,000, but the minimum allowed value was not on the portion of the page read. Cost estimate uses the $21.252/node-hour list price only.
8. **TimesFM on Vertex Model Garden pricing.** Only search-result snippets (Model Garden overview page and console model card) were seen; the console page was not fetched. Verified TimesFM facts are limited to BigQuery `AI.FORECAST`.
9. **OR-Tools licence on developers.google.com.** The docs site does not print the library's licence; Apache 2.0 was confirmed from the LICENSE file in Google's official GitHub repository (google/or-tools), which is outside the four requested doc domains.
10. **Google Cloud free-trial India specifics.** The trial page has no country list; it only warns "Depending on your country, you might also need to verify your bank account." Country-level eligibility for India was not explicitly confirmed on the page.
11. **Original cloud.google.com URLs.** cloud.google.com/free/docs/free-cloud-features, /bigquery/docs/..., /vertex-ai/docs/..., /speech-to-text/v2/docs/..., /functions/docs/console-quickstart all 301-redirect to docs.cloud.google.com; the docs.cloud.google.com pages were used. Pricing pages (cloud.google.com/bigquery/pricing, /speech-to-text/pricing, /translate/pricing, /vertex-ai/pricing) exceeded the fetch tool's size limit and were downloaded with curl and read as text; figures are quoted from that text.
