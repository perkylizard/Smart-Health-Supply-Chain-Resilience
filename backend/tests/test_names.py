from sanjeevani import names


def test_state_aliases():
    assert names.canon_state("Jammu and Kashmir") == "Jammu & Kashmir"
    assert names.canon_state("ANDAMAN & NICOBAR ISLANDS") == "A & N Islands"
    assert names.canon_state("Bihar") == "Bihar"


def test_district_override_census():
    assert names.canon_district("Bihar", "Purba Champaran", "census") == "East Champaran"
    assert names.canon_district("UTTAR PRADESH", "Mahamaya Nagar", "census") == "Hathras"


def test_district_case_match_with_known():
    assert names.canon_district("Bihar", "PATNA", "census", known={"Patna", "Gaya"}) == "Patna"


def test_unknown_passthrough():
    assert names.canon_district("Bihar", "Newtown", "census") == "Newtown"
