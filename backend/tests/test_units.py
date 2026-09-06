import pandas as pd
import pytest

from sanjeevani import paths, units


@pytest.fixture(scope="module")
def districts():
    p = paths.DATA_PROCESSED / "districts.parquet"
    if not p.exists():
        pytest.skip("districts.parquet not built")
    return pd.read_parquet(p)


def test_thirteen_units():
    assert len(units.demo_units()) == 13
    assert units.demo_units().query("is_hero").unit_id.tolist() == ["bihar"]


def test_ladakh_and_jk_split(districts):
    assert units.districts_for("ladakh", districts) == ["Kargil", "Leh Ladakh"]
    jk = units.districts_for("jammu_kashmir", districts)
    assert "Kargil" not in jk and "Srinagar" in jk


def test_bastar_seven(districts):
    b = units.districts_for("bastar", districts)
    assert len(b) == 7 and "Sukma" in b


def test_every_spec_district_exists(districts):
    for uid in units.demo_units()["unit_id"]:
        u = units.demo_units().set_index("unit_id").loc[uid]
        spec = [s.lstrip("-") for s in u["districts"].split(";") if s]
        pool = set(districts.loc[districts["state"] == u["state"], "district"])
        missing = [s for s in spec if s not in pool]
        assert not missing, f"{uid}: {missing}"


def test_unit_of(districts):
    assert units.unit_of("Bihar", "Patna", districts) == "bihar"
    assert units.unit_of("Chhattisgarh", "Raipur", districts) is None
