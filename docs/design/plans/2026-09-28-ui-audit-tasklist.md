# UI audit task list (28 Sep 2026)

Audited in Chrome at 1440 px across all five personas, plus earlier phone captures at 390 px. Ordered by what a judge sees first.

## P1: broken or misleading

- [ ] **Warehouse Indents cards have no inner padding.** They still use the old card markup, so text and buttons touch the card edge. Move to the transfer card anatomy (title, route, outcome band, action row).
- [ ] **PHC Deliveries shows unapproved proposals as "Arriving" with "Confirm it arrived".** Only approved or dispatched transfers should appear; proposals belong on the officer's board. Same card padding problem as Indents.
- [ ] **Commodity ids leak into the UI**: "rti sti kits", "paracetamol 500", "doxycycline 100", "ors" in Move stock headings, Deliveries and transfer cards. Use the catalogue's display names everywhere.
- [ ] **Warehouse indent quantities are implausible** (for example 3,15,526 calcium tablets to one CHC). Cap an indent at a sensible multiple of monthly demand and show units.
- [ ] **District Magistrate brief repeats "Risks next week"** in the main column and in the sidebar. Keep one.
- [ ] **Today: "What can I do now?" names the "dispatch board"** while the tab is called Move stock, and its single bullet repeats the button. Use one name and drop the bullet.

## P2: layout and hierarchy

- [ ] **Wide screens leave large empty areas**: Today's right column ends after Trends; DM Compare uses half the width; PHC screens are capped at 640 px; Indents' dispatched and delivered lanes sit empty. Fill with useful context or narrow the page intentionally.
- [ ] **League table stretches to full width with wide gaps between columns.** Give it a max width, a rank change, and colour on the score.
- [ ] **Ask screen**: the question box duplicates the app-bar search; Guided and Advanced read as a second button group beside Run; nothing below the examples explains what an answer looks like. Show one input, a segmented control above it, and an empty-state preview.
- [ ] **India view**: the "PHC" chip wraps under long state names in the table; the map has no state labels on dots; the heading says "All India" while 33 states report. Put the count in the heading and labels on hover.
- [ ] **PHC My stock**: the summary card lists names separated by commas with "+1"; make it the three items with their days, same figure style as the list.

## P3: polish

- [ ] "Briefing service is unavailable" appears whenever Gemini is in replay mode; replace with the cached briefing or a neutral line.
- [ ] Move stock heading should show the commodity's full name and a "Show all" link when filtered.
- [ ] Manual "New transfer" dialog on Move stock (officer-entered proposal), about two hours.
- [ ] Precompute every state's alerts at startup, or keep one Cloud Run instance warm, so the first open of any state is instant.
