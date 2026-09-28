"""Simulated Brazil node: generator properties and federation over UF nodes (nothing fetched)."""
import pandas as pd
import pytest

from sanjeevani.federated import brazil, fedavg as F, nodes as N


@pytest.fixture(scope="module")
def ledger():
    return brazil.generate(seed=21, months=36)


def test_generator_is_deterministic(ledger):
    again = brazil.generate(seed=21, months=36)
    assert int(pd.util.hash_pandas_object(ledger, index=False).sum()) == int(pd.util.hash_pandas_object(again, index=False).sum())


def test_shape_and_labels(ledger):
    assert ledger["state"].nunique() == 27 and set(ledger["source"]) == {"simulated"}
    assert ledger["month_index"].min() == 0 and ledger["month_index"].max() == 35
    assert {"facility_id", "commodity_id", "state", "district", "month_index", "month", "demand", "days_of_stock", "lead_days", "stockout"} <= set(ledger.columns)
    assert not ledger["facility_id"].str.contains("USF|UBS|PREFEITURA", regex=True).any()   # no real facility names


def test_amazon_lead_times_longer_than_south(ledger):
    amazon = ledger[ledger["state"].isin(brazil.AMAZON)]["lead_days"].mean()
    south = ledger[ledger["state"].isin(brazil.SOUTH)]["lead_days"].mean()
    assert amazon > south + 8


def test_stockout_rate_plausible_and_seasonal(ledger):
    rate = ledger["stockout"].mean()
    assert 0.02 <= rate <= 0.25
    ne = ledger[ledger["region"].isin(["N", "NE"]) & (ledger["commodity_id"] == "br_paracetamol_500")]
    by_month = ne.groupby("month")["stockout"].mean()
    assert by_month.loc[[2, 3]].mean() > 2 * by_month.loc[[7, 8]].mean()   # dengue season


def test_uf_nodes_and_federation_cross_zero_rows(ledger, tmp_path):
    p = tmp_path / "brazil.parquet"
    ledger[ledger["month_index"] < 18].to_parquet(p, index=False)
    nodes = N.brazil_uf_nodes(sample_per_uf=1500, ledger=p)
    assert len(nodes) >= 20 and all(n.group == "Brazil" for n in nodes)
    hist, summary = F.run(nodes[:6], rounds=2, local_epochs=1)
    assert summary["rows_crossed_border"] == 0 and len(hist) == 2


def test_two_country_hierarchy_names_top_aggregator():
    import numpy as np
    from sanjeevani.federated.model import featurise
    rng = np.random.default_rng(0)
    def node(name, group):
        n = 300; days = rng.uniform(0, 60, n); dem = rng.uniform(10, 300, n)
        X = featurise(days, dem, dem, rng.uniform(4, 14, n), rng.integers(1, 13, n), rng.normal(0, .3, n))
        y = (days < 12).astype(float)
        return F.Node(name, group, X[:200], y[:200], X[200:], y[200:])
    hist, summary = F.run([node("Bihar", "India"), node("Assam", "India"), node("AM", "Brazil"), node("SP", "Brazil")], rounds=2, top_name="BRICS")
    assert summary["groups"] == ["Brazil", "India"] and summary["top_aggregator"] == "BRICS" and summary["rows_crossed_border"] == 0
