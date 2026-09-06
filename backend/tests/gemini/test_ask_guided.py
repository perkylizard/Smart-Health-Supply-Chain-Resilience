import duckdb
import pytest

from sanjeevani import paths
from sanjeevani.gemini import ask_guided as G

pytestmark = pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")


@pytest.fixture(scope="module")
def con():
    return duckdb.connect(str(paths.DATA / "demo.duckdb"), read_only=True)


@pytest.mark.parametrize("name", list(G.SHAPES))
def test_every_shape_executes(con, name):
    s = G.SHAPES[name]
    params = {"commodity": "ors", "n": "5", "days_threshold": "20", "cadre": "", "facility": "PHC Araria", "item_code": "19.12"}
    df = G.execute(s, {k: v for k, v in params.items() if k in s.params}, "bihar", "Araria", con)
    assert df is not None


def test_coerce_rejects_unknown_and_caps_n():
    s = G.SHAPES["facilities_lowest_days"]
    with pytest.raises(ValueError):
        G.coerce(s, {"commodity": "ors", "evil": "1"})
    assert G.coerce(s, {"commodity": "ors", "n": "9999"})["n"] == 200
    assert G.coerce(s, {"commodity": "ors"})["n"] == 10


def test_lowest_days_sorted(con):
    df = G.execute(G.SHAPES["facilities_lowest_days"], {"commodity": "zinc", "n": "5"}, "bihar", "Araria", con)
    assert len(df) == 5 and df["days_of_stock"].is_monotonic_increasing
