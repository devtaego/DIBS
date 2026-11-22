"""발표 전 점검에서 나온 작은 수정들."""
import pytest

from app.core import clock
from tests.conftest import open_funding

pytestmark = pytest.mark.usefixtures("v5_policy")


def test_my_subscription_is_null_before_subscribing(api, published_work, now):
    api.login("a")
    f = open_funding(api, published_work["id"], now, target_units=100, max_units=250)
    assert api.ok("a", "get", f"/fundings/{f['id']}/subscriptions/me") is None


def test_fixed_clock_accepts_timezone_suffix():
    assert clock._parse_fixed("2027-03-02T09:00:00+09:00") == clock._parse_fixed("2027-03-02T09:00:00")
    assert clock._parse_fixed("2027-03-02T00:00:00Z").hour == 9  # UTC 0시 = KST 9시
    assert clock._parse_fixed(None) is None
