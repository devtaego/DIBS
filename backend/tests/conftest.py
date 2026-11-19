import os

os.environ["DIBS_ENV"] = "test"
os.environ["DIBS_DATABASE_URL"] = "sqlite://"

from datetime import datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core import clock  # noqa: E402
from app.core.db import get_db, init_db, make_engine  # noqa: E402
from app.main import create_app  # noqa: E402

T0 = datetime(2027, 3, 2, 10, 0, 0)  # 화요일 오전 10시 (KST)


@pytest.fixture
def now():
    clock.set_now(T0)
    yield T0
    clock.set_now(None)


@pytest.fixture(autouse=True)
def small_fundings(monkeypatch):
    """대부분의 흐름 테스트는 100조각(100만 원) 소액 펀딩으로 계산을 쉽게 한다.
    v4.0 실제 최소 모집 금액(3,000만 원)과 1인 한도(발행액 5%)는 test_v4.py 에서 따로 검증한다."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "min_target_amount", 1_000_000)
    monkeypatch.setattr(settings, "max_subscription_bps", 100_000)  # 소액 흐름 테스트는 1인 한도를 사실상 끈다


@pytest.fixture
def db_session_factory():
    engine = make_engine("sqlite://")
    init_db(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def client(db_session_factory, now):
    app = create_app()

    def _get_db():
        db = db_session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c


class Api:
    """테스트용 얇은 헬퍼: 역할별 로그인 토큰을 들고 호출."""

    def __init__(self, client: TestClient):
        self.c = client
        self.tokens: dict[str, str] = {}

    def login(self, name: str, role: str = "READER", kyc: bool = True, investor_type: str = "GENERAL") -> int:
        r = self.c.post("/auth/dev-login", json={"email": f"{name}@dibs.dev", "role": role,
                                                 "investor_type": investor_type})
        assert r.status_code == 200, r.text
        self.tokens[name] = r.json()["access_token"]
        if kyc:
            assert self.call(name, "post", "/auth/kyc/mock").status_code == 200
            assert self.call(name, "post", "/me/risk-profile", json={"answers": [3, 3, 3, 3, 3]}).status_code == 200
        return r.json()["user_id"]

    def call(self, who: str | None, method: str, url: str, **kw):
        headers = {"Authorization": f"Bearer {self.tokens[who]}"} if who else {}
        return getattr(self.c, method)(url, headers=headers, **kw)

    def ok(self, who, method, url, expect=(200, 201, 202), **kw):
        r = self.call(who, method, url, **kw)
        assert r.status_code in expect, f"{method.upper()} {url} → {r.status_code} {r.text}"
        return r.json()

    def err(self, who, method, url, code: str, **kw):
        r = self.call(who, method, url, **kw)
        assert r.status_code >= 400, f"expected error {code}, got {r.status_code} {r.text}"
        assert r.json()["error"]["code"] == code, r.text
        return r


@pytest.fixture
def api(client):
    return Api(client)


def iso(dt: datetime) -> str:
    return dt.isoformat()


@pytest.fixture
def published_work(api):
    """관리자·창작자 로그인 + 공개된 작품(회차 4개: 파일럿 1~3화 + 4화) 1개."""
    api.login("admin", "ADMIN")
    api.creator_id = api.login("creator", "CREATOR")
    w = api.ok("creator", "post", "/works", json={"title": "악녀인데 남주들이 나를 숭배한다", "type": "WEBTOON",
                                                  "genre": "로맨스 판타지", "rights_declared": True})
    for i in (1, 2, 3, 4):
        api.ok("creator", "post", f"/works/{w['id']}/episodes",
               json={"no": i, "title": f"{i}화", "content_url": f"s3://dibs/ep{i}"})
    api.ok("creator", "post", f"/works/{w['id']}/submit")
    api.ok("admin", "post", f"/admin/works/{w['id']}/review", json={"approve": True})
    return w


def open_funding(api, work_id: int, now: datetime, target_units: int = 100, max_units: int | None = None,
                 strategy: str = "PRO_RATA", tiers: list | None = None) -> dict:
    f = api.ok("creator", "post", f"/works/{work_id}/fundings", json={
        "target_units": target_units, "open_at": iso(now), "close_at": iso(now + timedelta(days=7)),
        "use_of_funds": "작화 외주 60%, 편집 20%, 마케팅 20%", "reward_tiers": tiers or [],
    })
    terms = {"allocation_strategy": strategy}
    if max_units:
        terms["max_units_per_user"] = max_units
    if strategy == "EQUAL_THEN_PRO_RATA":
        terms["allocation_params"] = {"equal_ratio_bps": 2000}
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/review", json={"approve": True, "terms": terms})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/open")
    return f
