"""시연·프런트 개발용 데모 데이터.

    python -m scripts.seed_demo            # ./dibs.db 에 생성
    DIBS_DATABASE_URL=sqlite:///./demo.db python -m scripts.seed_demo

만들어지는 것
- 파일럿 열람 이벤트: A 3.2만 명, B 2만 명 (지표 카드·펀딩 개설 조건이 실제 규모로 보이게)
- 작품 A 「악녀인데 남주들이 나를 숭배한다」: 펀딩 모집 중, 목표 5,000조각(5,000만 원)에 7,020조각 청약 (140%)
  · 1인 한도 250조각 (3,000만 원과 발행액 5% 중 작은 금액), reader1~3 은 모집 전 찜한 초기 독자
  · 파일럿 1~3화 무료, 4화부터 유료 미리보기 300원 (공개 21일 뒤 무료)
- 작품 B 「검을 거둔 아이」: 목표 3,000만 원, 균등 20%(초기 독자 우선 10%) + 비례 배정 → 상장, 마켓 체결·호가 있음
- 계정: admin@ / creator@ / reader1~30@dibs.dev  (POST /auth/dev-login 으로 토큰 발급)
  reader30 은 아무것도 청약하지 않은 계정 → 시연에서 새로 청약해 보기용
"""
import random
from datetime import timedelta

from fastapi.testclient import TestClient

from app.core import clock
from app.core.db import SessionLocal
from app.main import app
from app.models import ContentEvent, Episode
from app.models.enums import EventType


def seed_pilot_events(work_id: int, readers: int, finish_1: float, finish_3: float) -> None:
    """파일럿 1~3화 열람 이벤트 (최근 4주, 비로그인 기기 기준). 지표 카드·펀딩 개설 조건 시연용."""
    rnd = random.Random(work_id)
    now = clock.now()
    db = SessionLocal()
    eps = list(db.query(Episode).filter(Episode.work_id == work_id, Episode.no <= 3).order_by(Episode.no))
    rows = []
    for i in range(readers):
        anon, at = f"w{work_id}-d{i}", now - timedelta(minutes=rnd.randint(60, 27 * 24 * 60))
        rows.append(dict(anon_id=anon, event_type=EventType.VIEW_START, work_id=work_id, episode_id=eps[0].id,
                         occurred_at=at, props={}))
        if rnd.random() < finish_1:
            rows.append(dict(anon_id=anon, event_type=EventType.VIEW_COMPLETE, work_id=work_id,
                             episode_id=eps[0].id, occurred_at=at, props={}))
            if rnd.random() < finish_3 / finish_1:
                rows.append(dict(anon_id=anon, event_type=EventType.VIEW_COMPLETE, work_id=work_id,
                                 episode_id=eps[2].id, occurred_at=at + timedelta(minutes=20), props={}))
    db.bulk_insert_mappings(ContentEvent, rows)
    db.commit()
    db.close()

SUB = {"agree_risk_notice": True, "agree_termination_rule": True}


def main() -> None:
    with TestClient(app) as c:
        tok: dict[str, str] = {}

        def login(name: str, role: str = "READER") -> None:
            r = c.post("/auth/dev-login", json={"email": f"{name}@dibs.dev", "role": role})
            tok[name] = r.json()["access_token"]
            call(name, "post", "/auth/kyc/mock")
            call(name, "post", "/me/risk-profile", json={"answers": [3, 3, 3, 3, 3]})

        def call(who: str, method: str, url: str, **kw):
            r = getattr(c, method)(url, headers={"Authorization": f"Bearer {tok[who]}"}, **kw)
            if r.status_code >= 400:
                raise SystemExit(f"{method.upper()} {url} 실패: {r.status_code} {r.text}")
            return r.json()

        login("admin", "ADMIN")
        login("creator", "CREATOR")
        readers = [f"reader{i}" for i in range(1, 31)]
        for r in readers:
            login(r)
            call(r, "post", "/wallet/deposit/charge", json={"amount": 5_000_000})
            call(r, "post", "/wallet/coin/charge", json={"amount": 5_000})

        def make_work(title: str, genre: str, n_eps: int) -> int:
            w = call("creator", "post", "/works", json={"title": title, "type": "WEBTOON", "genre": genre,
                                                        "synopsis": f"{title} (데모)", "rights_declared": True})
            for i in range(1, n_eps + 1):
                call("creator", "post", f"/works/{w['id']}/episodes",
                     json={"no": i, "title": f"{i}화", "content_url": f"https://cdn.example/{w['id']}/{i}"})
            call("creator", "post", f"/works/{w['id']}/shorts",
                 json={"title": f"{title} 1분 티저", "video_url": f"https://cdn.example/{w['id']}/short.mp4",
                       "duration_sec": 58})
            call("creator", "post", f"/works/{w['id']}/submit")
            call("admin", "post", f"/admin/works/{w['id']}/review", json={"approve": True})
            return w["id"]

        def make_funding(work_id: int, target: int, tiers: list) -> int:
            now = clock.now()
            f = call("creator", "post", f"/works/{work_id}/fundings", json={
                "target_units": target, "open_at": now.isoformat(), "close_at": (now + timedelta(days=14)).isoformat(),
                "use_of_funds": "작화 외주 60% · 편집 20% · 마케팅 20%", "reward_tiers": tiers})
            call("admin", "post", f"/admin/fundings/{f['id']}/review",
                 json={"approve": True, "terms": {}})  # 배분·배정·한도는 v4.0 기본값
            call("admin", "post", f"/admin/fundings/{f['id']}/open")
            return f["id"]

        # 작품 A: 모집 중 842%
        a = make_work("악녀인데 남주들이 나를 숭배한다", "로맨스 판타지", 14)
        seed_pilot_events(a, 32_000, 0.85, 0.55)  # 예상 월 열람자 약 2.2만 명 → 목표 5,000만 원 개설 가능
        for r in readers[:3]:
            call(r, "put", f"/works/{a}/dib")
        call("creator", "patch", "/me", json={"bio": "로맨스 판타지를 그리는 신인 작가"})
        for ep in call("creator", "get", f"/works/{a}/episodes")[3:]:  # 4화부터 유료 미리보기
            call("admin", "patch", f"/admin/episodes/{ep['id']}/pricing", json={"is_paid": True})
        fa = make_funding(a, 5000, [{"title": "에필로그 크레딧 등재", "min_units": 1},
                                    {"title": "한정판 양장본 + 넘버링 카드", "min_units": 30, "limited_qty": 50,
                                     "requires_shipping": True}])
        for i, r in enumerate(readers[:29]):  # 28명 × 250 + 20 = 7,020조각
            call(r, "post", f"/fundings/{fa}/subscriptions", json={**SUB, "units": 250 if i < 28 else 20})

        # 작품 B: 상장 + 거래
        b = make_work("검을 거둔 아이", "무협", 8)
        seed_pilot_events(b, 20_000, 0.8, 0.5)
        for r in readers[3:6]:
            call(r, "put", f"/works/{b}/dib")  # 모집 전 찜 → 초기 독자 우선 배정
        fb = make_funding(b, 3000, [])
        for r in readers[:25]:  # 25명 × 150 = 3,750조각 (125%), 1인 한도 150조각
            call(r, "post", f"/fundings/{fb}/subscriptions", json={**SUB, "units": 150})
        call("admin", "post", f"/admin/fundings/{fb}/close", params={"force": True})
        call("admin", "post", f"/admin/fundings/{fb}/issuance", json={"broker_name": "제휴증권(모의)"})
        for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS0000002", "trustee": "모의신탁"}),
                            ("LISTING_SCHEDULED", {"listing_date": clock.now().date().isoformat()}), ("LISTED", {})]:
            call("admin", "post", f"/admin/fundings/{fb}/issuance/advance", json={"step": step, **extra})
        order = {"funding_id": fb, "agree_risk_notice": True}
        call("reader1", "post", "/market/orders", json={**order, "side": "SELL", "price": 11_500, "units": 10})
        call("reader2", "post", "/market/orders", json={**order, "side": "BUY", "price": 11_500, "units": 6})
        call("reader3", "post", "/market/orders", json={**order, "side": "SELL", "price": 12_000, "units": 5})
        call("reader4", "post", "/market/orders", json={**order, "side": "BUY", "price": 11_000, "units": 8})

        call("creator", "post", f"/works/{b}/posts", json={"kind": "BOARD", "body": "9화는 다음 주 화요일에 올라와요"})
        call("reader1", "post", f"/works/{b}/posts", json={"kind": "HOLDER_BOARD", "body": "첫 분기 배당 기대돼요"})
        call("admin", "post", "/admin/notices", json={"title": "매일 04:00~04:30 마켓 점검", "body": "점검 중에는 주문할 수 없어요.",
                                                     "category": "MAINTENANCE", "is_pinned": True})

        print(f"작품 A id={a}, 펀딩 id={fa} (모집 중)")
        print(f"작품 B id={b}, 종목 id={fb} (상장)")
        print("로그인: POST /auth/dev-login {\"email\": \"reader1@dibs.dev\"}")


if __name__ == "__main__":
    main()
