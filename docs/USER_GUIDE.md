# Sanjeevani Grid user guide

Live app: **https://sanjeevani-grid.web.app** · works on a phone or a computer, in English and Hindi.

Sanjeevani Grid keeps essential medicines on the shelves of India's primary health centres. It warns before a medicine runs out, finds surplus stock nearby, and tracks every movement of stock from the district store to the patient.

- [Getting started](#getting-started)
- [Open a role directly](#open-a-role-directly)
- [Facility staff (pharmacist, PHC or CHC)](#facility-staff)
- [District Health Officer](#district-health-officer)
- [District store (warehouse)](#district-store)
- [District Magistrate](#district-magistrate)
- [State officer](#state-officer)
- [How stock goes up and down](#how-stock-goes-up-and-down)
- [Privacy](#privacy)
- [What is real and what is simulated](#what-is-real-and-what-is-simulated)
- [Troubleshooting](#troubleshooting)

## Getting started

1. Open the app. It starts as the **District Health Officer** for a Bihar district.
2. **Pick a role** from the **Role** menu at the top: Facility staff, District Health Officer, District store, District Magistrate or State officer. Each role sees only the screens it needs.
3. **Pick a place** with the location menu next to it (state › district). Facility staff then choose their facility.
4. **Take the tour.** The first time you open a role, the app offers a one-minute tour. You can start it again at any time from the Role menu → **Take the tour**.
5. **Hindi or English:** the हिंदी / English button at the top switches every screen.

Every screen refreshes itself every 30 seconds, so a change made in one role appears in the others without reloading.

## Open a role directly

Switch roles any time with the **Role** menu at the top (on a phone, the round badge with initials such as DH or PH). Or open a role directly; all links use Kaimur Bhabua district, Bihar:

| Role | Open directly |
|---|---|
| District Health Officer | https://sanjeevani-grid.web.app/dho/bihar/Kaimur%20Bhabua |
| Facility staff (CHC Kaimur Bhabua 1) | https://sanjeevani-grid.web.app/phc/bihar-kaimur-bhabua-chc-chc-kaimur-bhabua-1-807 |
| District store | https://sanjeevani-grid.web.app/warehouse/bihar/Kaimur%20Bhabua |
| District Magistrate | https://sanjeevani-grid.web.app/dm/bihar/Kaimur%20Bhabua |
| State officer | https://sanjeevani-grid.web.app/state/bihar |

**Follow one request through every role (about 3 minutes):**
1. **Facility staff:** on *My stock*, tap **+ Request** on any medicine, enter a quantity, **Send request**.
2. **District Health Officer:** *Today* → **Requests** tab → **Approve**.
3. **District store:** *Indents* → **Mark dispatched** on that medicine.
4. **Facility staff:** *Deliveries* → **Received**. The stock on *My stock* goes up by that quantity.
5. Also try **− Give** on a medicine (the stock goes down at once), and **Report** with a line such as `ORS ke 40 packet bache hain`.

## Facility staff

Tabs: **My stock · Report · Deliveries**

### See what is running out
**My stock** lists every medicine the facility holds, with the days left, sorted so what runs out first is at the top. **What will run out?** at the top names the most urgent ones. Filter by type (Chronic, Maternal, Vaccines…) or search by name.

### Give medicine to a patient (stock goes down)
1. Tap **− Give** on the medicine's row, or **− Give to patient** at the top.
2. Enter the quantity, or tap 1, 2, 5 or 10. The dialog shows what is on hand and what will be left.
3. Optionally add the patient's **name, age and village or ward**. The **OPD slip no.** fills itself in with the next number for the day. Change it if the patient brought a slip.
4. Tap **Record**. The stock drops at once.
5. For another medicine for the **same patient**, pick it and tap Record again: the slip and details stay. For someone new, tap **Next patient**.

You cannot give more than you have, and a medicine with none on hand cannot be chosen. **Given out today** on the right lists today's medicines and how many patients were seen.

### Report what is on the shelf
**Report** takes stock updates in your own words:
- **Type a line**, in Hindi or English: `ORS ke 40 packet bache hain` sets ORS to 40. `Paracetamol 2 diye` records 2 given to a patient (the stock goes down by 2).
- **Photo of register**: photograph the stock register page; Gemini reads it.
- **Voice note**: speak in Hindi or English; Gemini reads it.

Everything is **read back to you with the before and after figures**, and nothing is saved until you tap **Confirm**. If a word fits several products (for example "zinc" or "IFA"), the app asks **Which one?** instead of guessing.

### Ask the district for stock (stock goes up)
1. Tap **+ Request** on a row, or **Request stock** at the top. Enter the quantity and an optional reason.
2. The request goes to the District Health Officer. Follow it under **Deliveries → My requests**: waiting, approved, on the way, delivered, or not supplied with the reason.
3. When the stock physically arrives, tap **Received**. Your stock goes up by that quantity on every screen.

### Transfers with another facility
If the district moves stock between facilities, it appears under **Deliveries**:
- **Giving facility:** tap **Handed over** when it leaves. It comes off your stock when the other facility confirms.
- **Receiving facility:** tap **Confirm it arrived**. It is added to your stock.

**Change facility** at the top switches to another PHC or CHC.

## District Health Officer

Tabs: **Today · Move stock · Ask · Settings**

### Today
The top card shows the district's **resilience score**, its place in the **state league**, and four figures: stock shortages, bed occupancy, staff posts filled and outpatient visits. Tap a figure to open its tab. The **Morning briefing** is written by Gemini from the day's numbers.

Below are six tabs. The number on each is what is waiting:

| Tab | What you do there |
|---|---|
| **Requests** | Facility requests. **Approve** sends one to the district store. **Decline** asks for a reason, which the facility sees. **Track decided requests** follows each one to delivery. If the store cannot supply, the request comes back here with its reason: approve it again or close it. |
| **Transfers** | Surplus in one facility matched to a shortage in another, by distance and days of stock. **Why this transfer?** has Gemini explain it; **Approve** starts it. |
| **Stock alerts** | What runs out before the next delivery can arrive (Critical, Warning, Watch), each with its suggested fix. |
| **Map** | Every facility, worst first. Open one to see its stock, beds and staff. |
| **Beds & staff** | Bed occupancy and staff posts by facility. |
| **Stock counts** | Counts reported by facility staff, newest first. |

### Move stock
**Needs** lists facilities under their resupply threshold. Transfers move through lanes as they are approved, picked up and delivered. Pick a transfer to see its **route** on the map, where red dots are facilities with under a week of stock.

### Ask
Ask a question in plain words, for example *"which PHCs have the least ORS?"*. You get a one-line answer, the rows behind it (downloadable as CSV), a chart when useful, and the exact read-only query that produced it.

### Scenario (what-if)
**Scenario** at the top applies a what-if to every screen: Monsoon flood (diarrhoea surge), Dengue season, Winter road closure, Cyclone landfall or State warehouse supply shock. Alerts, transfers and beds recompute. Choose **No scenario** to go back.

## District store

Tabs: **Indents · Store stock**

- **Indents** is the queue of what facilities need: approved facility requests first, then alert-raised needs, grouped by facility, in three lanes: **pending, dispatched, delivered**.
  - **Mark dispatched** when stock leaves the store. It is logged in the store's issue register.
  - **Can't supply** sends an approved request back to the District Health Officer with a reason (for example, out of stock at the store).
  - A delivery closes when the facility taps **Received**.
- **Store stock** shows the store's own stock book from the HMIS ledger, month by month, plus the **issue register** of everything dispatched.

## District Magistrate

Tabs: **Weekly brief · Compare**

- **Weekly brief:** a one-page summary written by Gemini from the week's numbers; the district against the state median; every facility request by status; **Escalate to the state** sends a note the State officer sees.
- **Compare:** where the district ranks among its neighbours in the state league, against the state median, and every facility sorted by risk (high, watch, stable) using stock, bed occupancy and doctor presence.

## State officer

Tabs: **State · Districts · India · Federated learning · Ask**

- **State:** every district on one map, coloured by resilience; transfers between districts waiting for state approval; the district league; facility requests statewide.
- **Districts:** a sortable table of every district.
- **India:** every state's HMIS ledger at a glance.
- **Federated learning:** districts, states and a simulated Brazil partner train one early-warning model together. **No record leaves its node**: the "Rows that left a node" counter stays at 0. See the results per tier, or tap **Run a live round**.
- **Ask:** questions in plain words, as for the District Health Officer.

## How stock goes up and down

| Movement | Who | Where | Stock |
|---|---|---|---|
| Give to a patient | Facility staff | My stock → Give, or Report "… diye" | ↓ at once |
| Count the shelf | Facility staff | Report (type, photo or voice) | Set to the count |
| Receive a delivery | Facility staff | Deliveries → Received | ↑ |
| Hand over a transfer | Giving facility | Deliveries → Handed over | ↓ when it arrives |
| Confirm a transfer | Receiving facility | Deliveries → Confirm it arrived | ↑ |
| Dispatch from the store | District store | Indents → Mark dispatched | Logged in the store's issue register |
| Approve or decline | District Health Officer, State officer | Requests, Transfers | No change; it unlocks the move |

Every movement updates days left, alerts and every role's screen within 30 seconds. A stock movement can only be counted once.

## Privacy

- Patient name, age and village are **optional** and are seen **only by that facility's staff**. They are never shown to other roles, never sent to Gemini and never used in federated learning.
- Federated learning shares model updates, never records.

## What is real and what is simulated

Every figure carries a label:
- **HMIS real:** India's official district stock ledgers (MoHFW, HMIS), used for the district and state views and the forecasts.
- **simulated:** facility-level stock, beds and staff, generated from the real district series because facility-level data is not public; also the Brazil partner node.
- **Gemini:** text written by Gemini (briefings, explanations, reading photos and voice notes). The numbers come from the engine, not from Gemini.

## Troubleshooting

| You see | What to do |
|---|---|
| "Waking the server after an update" | The server is starting after a deploy. Wait a few seconds. |
| "Some of this page couldn't load" | Tap **Retry**. |
| "We could not find this district / facility" | The link was mistyped or old. Use the button to go to the right place. |
| "Explanation unavailable right now" | Gemini did not answer in time. Try again; the numbers on screen are unaffected. |
| Photo or voice not read | Retake the photo in good light with the whole page in frame, or type the line instead. |
| Requests or stock changes vanished after an update | The demo keeps activity in memory, so a new deploy starts fresh with sample requests. |
