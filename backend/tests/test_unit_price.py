"""1조각 = 1만 원 (서비스 기본값)."""
from tests.conftest import open_funding


def test_default_unit_price_is_10000(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 1_000_000})
    f = open_funding(api, published_work["id"], now, target_units=1000)  # 1,000조각 = 1,000만 원
    d = api.ok(None, "get", f"/fundings/{f['id']}")
    assert d["unit_price"] == 10_000 and d["target_amount"] == 10_000_000
    s = api.ok("a", "post", f"/fundings/{f['id']}/subscriptions",
               json={"units": 3, "agree_risk_notice": True, "agree_termination_rule": True})
    assert s["units"] == 3
    w = api.ok("a", "get", "/wallet")
    assert w["deposit_locked"] == 30_000  # 3조각 = 3만 원이 청약 증거금으로 묶인다
