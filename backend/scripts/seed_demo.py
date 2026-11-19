"""시연·프런트 개발용 데모 데이터.

    python -m scripts.seed_demo            # ./dibs.db 에 생성
    DIBS_DATABASE_URL=sqlite:///./demo.db python -m scripts.seed_demo

만들어지는 것
- 파일럿 열람 이벤트: A 3.2만 명, B 2만 명 / 유료 미리보기 구매자(월 유료 팬): A 5,200명, B 3,500명
  (v5.0 발행 조건·목표 금액 상한은 유료 팬 기준. 1,000만 원에 약 3,400명 필요)
- 작품 A 「악녀인데 남주들이 나를 숭배한다」: 펀딩 모집 중, 목표 1,500조각(1,500만 원)에 2,175조각 청약 (145%)
  · 1인 한도 75조각 (3,000만 원과 발행액 5% 중 작은 금액), reader1~3 은 모집 전 찜한 초기 독자
  · 파일럿 1~3화 무료, 4화부터 유료 미리보기 300원 (공개 21일 뒤 무료)
- 작품 B 「검을 거둔 아이」: 목표 1,000만 원, 균등 20%(초기 독자 우선 10%) + 비례 배정 → 상장, 마켓 체결·호가 있음
  · 상장 후 결제는 신탁 계좌로 바로 분할 → GET /fundings/{id}/disclosure 에서 대사·원장 해시 확인
- 계정: admin@ / creator@ / reader1~30@dibs.dev  (POST /auth/dev-login 으로 토큰 발급)
  reader30 은 아무것도 청약하지 않은 계정 → 시연에서 새로 청약해 보기용
"""
import random
from datetime import timedelta

from fastapi.testclient import TestClient

from app.core import clock
from app.core.db import SessionLocal
from app.main import app
from app.models import ContentEvent, Episode, EpisodeUnlock, Journal, User
from app.models.enums import EventType, Mode


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

def seed_paying_fans(work_id: int, fans: int) -> None:
    """최근 4주 유료 미리보기 구매자 (4화 300원). 시연용이라 분개 1건을 공유하고 계정만 따로 만든다."""
    rnd = random.Random(work_id * 7)
    now = clock.now()
    db = SessionLocal()
    ep = db.query(Episode).filter(Episode.work_id == work_id, Episode.no == 4).one()
    j = Journal(kind="SEED_PILOT_PURCHASES", mode=Mode.LIVE, memo=f"work {work_id} 파일럿 유료 구매 (시연)")
    db.add(j)
    db.flush()
    start = (db.query(User.id).order_by(User.id.desc()).first() or (0,))[0] + 1
    db.bulk_insert_mappings(User, [dict(id=start + i, email=f"fan{work_id}-{i}@seed.dibs.dev", nickname=f"팬{i}",
                                        kyc_verified=True) for i in range(fans)])
    db.bulk_insert_mappings(EpisodeUnlock, [dict(user_id=start + i, episode_id=ep.id, work_id=work_id, price_coin=300,
                                                 journal_id=j.id,
                                                 unlocked_at=now - timedelta(minutes=rnd.randint(60, 27 * 24 * 60)))
                                            for i in range(fans)])
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
        seed_pilot_events(a, 32_000, 0.85, 0.55)
        for r in readers[:3]:
            call(r, "put", f"/works/{a}/dib")
        call("creator", "patch", "/me", json={"bio": "로맨스 판타지를 그리는 신인 작가"})
        for ep in call("creator", "get", f"/works/{a}/episodes")[3:]:  # 4화부터 유료 미리보기
            call("admin", "patch", f"/admin/episodes/{ep['id']}/pricing", json={"is_paid": True})
        seed_paying_fans(a, 5_200)  # 유료 팬 5,200명 → 목표 금액 상한 1,500만 원
        fa = make_funding(a, 1500, [{"title": "에필로그 크레딧 등재", "min_units": 1},
                                    {"title": "한정판 양장본 + 넘버링 카드", "min_units": 30, "limited_qty": 50,
                                     "requires_shipping": True}])
        for r in readers[:29]:  # 29명 × 75 = 2,175조각 (145%), 1인 한도 75조각 = 75만 원
            call(r, "post", f"/fundings/{fa}/subscriptions", json={**SUB, "units": 75})

        # 작품 B: 상장 + 거래
        b = make_work("검을 거둔 아이", "무협", 8)
        seed_pilot_events(b, 20_000, 0.8, 0.5)
        for ep in call("creator", "get", f"/works/{b}/episodes")[3:]:
            call("admin", "patch", f"/admin/episodes/{ep['id']}/pricing", json={"is_paid": True})
        seed_paying_fans(b, 3_500)  # 유료 팬 3,500명 → 상한 1,000만 원
        for r in readers[3:6]:
            call(r, "put", f"/works/{b}/dib")  # 모집 전 찜 → 초기 독자 우선 배정
        fb = make_funding(b, 1000, [])
        for r in readers[:25]:  # 25명 × 50 = 1,250조각 (125%), 1인 한도 50조각 = 50만 원
            call(r, "post", f"/fundings/{fb}/subscriptions", json={**SUB, "units": 50})
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
        b_eps = call("creator", "get", f"/works/{b}/episodes")
        for r in readers[5:15]:  # 상장 후 유료 구매 → 신탁 계좌로 바로 분할 (공시 대사 시연)
            call(r, "post", f"/episodes/{b_eps[4]['id']}/unlock")

        call("creator", "post", f"/works/{b}/posts", json={"kind": "BOARD", "body": "9화는 다음 주 화요일에 올라와요"})
        call("reader1", "post", f"/works/{b}/posts", json={"kind": "HOLDER_BOARD", "body": "첫 분기 배당 기대돼요"})
        call("admin", "post", "/admin/notices", json={"title": "매일 04:00~04:30 마켓 점검", "body": "점검 중에는 주문할 수 없어요.",
                                                     "category": "MAINTENANCE", "is_pinned": True})

        print(f"작품 A id={a}, 펀딩 id={fa} (모집 중)")
        print(f"작품 B id={b}, 종목 id={fb} (상장)")
        print("로그인: POST /auth/dev-login {\"email\": \"reader1@dibs.dev\"}")


if __name__ == "__main__":
    main()
