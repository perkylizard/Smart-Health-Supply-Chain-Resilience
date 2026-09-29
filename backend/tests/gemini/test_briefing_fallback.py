from sanjeevani.gemini import briefing as B

SUMMARY = {"district": "Araria", "counts": {"red": 141, "amber": 75}, "transfers_ready": 266,
           "alerts": [{"alert": True, "facility_name": "CHC Araria 1", "commodity_name": "Calcium 500 mg tablet", "days_of_stock": 0.0, "cause": "supply_missed"},
                      {"alert": False, "facility_name": "PHC X", "commodity_name": "ORS", "days_of_stock": 40, "cause": "none"}]}


def test_fallback_is_a_real_briefing_not_an_outage_notice():
    b = B.fallback(SUMMARY, "en")
    text = " ".join([b.headline, *b.body, *b.top_actions]).lower()
    assert "unavailable" not in text and "141" in b.headline
    assert b.body[0] == "CHC Araria 1 has run out of Calcium 500 mg tablet, because of a missed supply."
    assert "266 transfers" in b.body[-1] and b.top_actions == ["Send stock to CHC Araria 1"]


def test_fallback_hindi_and_empty():
    assert "CHC Araria 1" in B.fallback(SUMMARY, "hi").body[0]
    assert B.fallback({"district": "D", "counts": {}, "alerts": []}, "en").body == ["Nothing is running short today."]


def test_fallback_groups_one_facility_into_one_sentence():
    s = {"district": "D", "counts": {"red": 3}, "alerts": [{"alert": True, "facility_name": "CHC A", "commodity_name": m, "days_of_stock": 0, "cause": "supply_missed"} for m in ("X", "Y", "Z")]
         + [{"alert": True, "facility_name": "PHC B", "commodity_name": "W", "days_of_stock": 4, "cause": "cases_up"}]}
    b = B.fallback(s, "en")
    assert b.body == ["CHC A has run out of X, Y and Z, because of a missed supply.", "PHC B has 4 days of W left, because of rising cases."]
