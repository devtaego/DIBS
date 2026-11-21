"""시연·프런트 개발용 데모 데이터.

    python -m scripts.seed_demo            # ./dibs.db 에 생성
    DIBS_DATABASE_URL=sqlite:///./demo.db python -m scripts.seed_demo

만들어지는 것
- 파일럿 열람 이벤트: A 3.2만 명, B 2만 명 / 유료 미리보기 구매자(월 유료 팬): A 5,200명, B 3,500명
  (v5.0 발행 조건·목표 금액 상한은 유료 팬 기준. 1,000만 원에 약 3,400명 필요)
- 작품 A 「악녀인데 남주들이 나를 숭배한다」: 펀딩 모집 중, 목표 1,500조각(1,500만 원)에 2,175조각 청약 (145%)
  · 1인 한도 75조각 (3,000만 원과 발행액 5% 중 작은 금액), reader1~3 은 모집 전 찜한 초기 독자
  · 파일럿 1~3화 무료, 4화부터 유료 미리보기 300원 (공개 21일 뒤 무료)
- 작품 B 「청월도」: 목표 1,000만 원, 균등 20%(초기 독자 우선 10%) + 비례 배정 → 상장, 마켓 체결·호가 있음
  · 상장 후 결제는 신탁 계좌로 바로 분할 → GET /fundings/{id}/disclosure 에서 대사·원장 해시 확인
- 계정: admin@ / creator@ / reader1~30@dibs.dev  (POST /auth/dev-login 으로 토큰 발급)
  reader30 은 아무것도 청약하지 않은 계정 → 시연에서 새로 청약해 보기용
- 그 밖에 모집 중 펀딩 6개, 펀딩 없는 작품 33개 (표지: app/public/covers, 쇼츠 영상 1개: app/public/shorts)
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

# 데모 작품 카탈로그: (표지 파일 slug, 제목, 원본 표지 파일, 형식, 장르, 소개)
# 표지는 app/public/covers/<slug>.jpg (원본은 DIBS 드라이브 폴더, 480x720으로 줄임). 앱 기준 상대 경로로 저장한다
CATALOG = [
 ("akn",  "악녀인데 남주들이 나를 숭배한다", "웹소설/악녀를 숭배하는 세 남자.png", "WEBTOON", "로맨스 판타지", None),
 ("cwd",  "청월도", "웹툰/청월도_.png", "WEBTOON", "무협", "달빛이 푸른 밤, 멸문한 가문의 막내가 검을 든다."),
 ("isg",  "이세계 맛집 사장님", "웹툰/이세계_맛집_사장님.png", "WEBTOON", "요리 · 이세계", "이세계로 떨어진 동네 분식집 사장이 마왕군 단골을 만든다."),
 ("jnb",  "죽은 줄 알았던 남편이 내 상사로 돌아왔다", "웹소설/죽은 남편, 내 상사로 돌아왔다.png", "WEBNOVEL", "현대 로맨스", "장례식 1년 뒤, 새 본부장으로 나타난 남편."),
 ("gnl",  "그날, 사건이 시작됐다", "웹툰/그날_사건이_시작됐다.png", "WEBTOON", "미스터리 · 추리", "작은 섬마을 고등학교에서 사라진 졸업 앨범."),
 ("htj",  "황태자의 가짜 신부는 사실 살인자였다", "웹소설/황태자의 가짜 신부, 붉은 달빛 아래.png", "WEBNOVEL", "로판 · 스릴러", "가짜 신부로 들어간 암살자가 황태자에게 들킨다."),
 ("wrb",  "우리 반은 전셜입니다", "웹툰/우리_반은_전설입니다.png", "WEBTOON", "학원 · 코미디", "전설의 영웅들이 같은 반 고등학생으로 환생했다."),
 ("sgl",  "시골에선 슬로우라이프", "웹툰/시골에서_슬로우라이프.png", "WEBTOON", "힐링 · 일상", "번아웃 직장인의 귀촌 1년 기록."),
 # 작품만 (펀딩 없음)
 ("gyb",  "고양이빵집", "웹툰/고양이빵집.png", "WEBTOON", "일상 · 힐링", "오늘도 빵을 굽는 고양이 제빵사의 행복한 하루."),
 ("ghb",  "금요일엔 유령 분식", "웹툰/금요일엔_유령_분식.png", "WEBTOON", "코미디 · 판타지", "금요일 밤에만 문을 여는 분식집, 손님은 전부 유령."),
 ("njs",  "낙제생인데 아카데미 최강?!", "웹툰/낙제생인데_아카데미_최강.png", "WEBTOON", "아카데미 · 액션", "만년 낙제생의 숨겨진 재능이 깨어난다."),
 ("dsg",  "다시, 그라운드로!", "웹툰/다시_그라운드로.png", "WEBTOON", "스포츠 · 성장", "부상으로 떠났던 축구부 에이스의 복귀전."),
 ("syp",  "심야 편의점 냥알바", "웹툰/심야편의점냥알바.png", "WEBTOON", "일상 · 개그", "새벽 2시 편의점 알바생은 고양이."),
 ("ond",  "오늘도 너에게 반했어", "웹툰/오늘도_너에게_반했어.png", "WEBTOON", "로맨틱 코미디", "매일 새로 반하는 소꿉친구 연애담."),
 ("cgm",  "천검", "웹툰/천검.png", "WEBTOON", "무협", "하늘이 내린 검을 둘러싼 강호의 쟁탈전."),
 ("pwh",  "풍운행", "웹툰/풍운행.png", "WEBTOON", "무협", "떠돌이 무사가 걷는 바람과 구름의 길."),
 ("cpb",  "화분 키우는 카피바라", "웹툰/화분_키우는_카피바라.png", "WEBTOON", "일상 · 코미디", "느긋한 카피바라의 베란다 식물 일지."),
 ("gjs",  "내 가족을 죽인 남자가 나를 사랑한다", "웹소설/가족의 원수가 된 사랑.png", "WEBNOVEL", "로맨스 · 스릴러", "복수하러 다가간 남자가 먼저 사랑을 고백했다."),
 ("nba",  "나를 버린 남자가 내 아이를 훔쳐갔다", "웹소설/나를 버린 남자가 내 아이를 훔쳐갔다.png", "WEBNOVEL", "현대 로맨스", "5년 만에 나타난 전 연인이 아이의 양육권을 노린다."),
 ("nbh",  "나를 버린 황제가 내 시종이 됐다", "웹소설/나를 버린 황제, 내 시종이 됐다.png", "WEBNOVEL", "로맨스 판타지", "폐위된 황제가 버렸던 황후의 시종으로 들어온다."),
 ("nbr",  "내 남편의 불륜상대는 미래의 나였다", "웹소설/내 남편의 불륜상대는 미래의 나였다.png", "WEBNOVEL", "미스터리 · 타임슬립", "남편의 비밀 연인은 10년 뒤의 나였다."),
 ("nsd",  "내 식당 마지막 손님은 어제 죽었다", "웹소설/내 식당 마지막 손님은 어제 죽었다.png", "WEBNOVEL", "요리 · 미스터리", "어젯밤 마지막 손님이 오늘 아침 뉴스에 나왔다."),
 ("njr",  "내 장례식에서 남편이 웃었다", "웹소설/내 장례식에서 남편이 웃었다.png", "WEBNOVEL", "복수극 · 스릴러", "죽은 뒤에야 본 남편의 미소, 그리고 회귀."),
 ("njk",  "내가 죽인 악역과 결혼해야 한다", "웹소설/내가 죽인 악역과 결혼해야한다.png", "WEBNOVEL", "로판 · 계약결혼", "소설 속 악역을 죽였더니 그와의 혼약서가 날아왔다."),
 ("nbs",  "내 변호사는 내 살인범을 알고 있다", "웹소설/내변호사는 내 살인범을 알고 있다.png", "WEBNOVEL", "법정 스릴러", "무죄를 주장하는 내 변호사가 진범을 감싼다."),
 ("dmg",  "도망친 검객은 약초꾼이 되었다", "웹소설/도망친 검객은 약초꾼이 되었다.png", "WEBNOVEL", "무협 · 힐링", "검을 버린 천재 검객의 산골 약초 생활."),
 ("jby",  "재벌 약혼자의 비밀 정부가 되었다", "웹소설/비밀스러운 욕망의 도시 로맨스.png", "WEBNOVEL", "현대 로맨스", "약혼녀 대신 그의 곁에 선 비밀스러운 계약."),
 ("abp",  "아빠가 내 안티팬이다", "웹소설/아빠가 내 안티팬이다.png", "WEBNOVEL", "코미디 · 가족", "악플러를 잡고 보니 우리 아빠였다."),
 ("apl",  "악플 달았더니 소설 속 최종보스가 찾아왔다", "웹소설/악플 달았더니 소설 속 최종보스가 찾아왔다.png", "WEBNOVEL", "코믹 판타지", "최종보스가 내 댓글을 읽고 현실로 찾아왔다."),
 ("whg",  "우리 반 전원이 회귀했다. 나만 빼고", "웹소설/우리 반 전원이 회귀했다.png", "WEBNOVEL", "학원 · 회귀", "반 친구 전원이 미래를 기억한다. 나만 빼고."),
 ("ush",  "우승한 날, 에이스가 사라졌다", "웹소설/우승한날에이스가사라졌다.png", "WEBNOVEL", "스포츠 미스터리", "결승 다음 날, 우승의 주역이 실종됐다."),
 ("ets",  "은퇴한 톱스타가 우리 회사 막내가 됐다", "웹소설/은퇴한 톱스타가 우리회사 막내가 됐다.png", "WEBNOVEL", "오피스 코미디", "은퇴한 국민 배우가 신입 사원으로 입사했다."),
 ("ihs",  "이혼 도장 찍자마자 S급 각성", "웹소설/이혼 직후 S급 각성.png", "WEBNOVEL", "현대 판타지", "이혼 서류에 도장을 찍는 순간 S급 헌터로 각성했다."),
 ("iai",  "인류가 멸종한 날, 내 AI 아내가 출근했다", "웹소설/인류가 멸종한날 내 AI아내가 출근했다.png", "WEBNOVEL", "근미래 SF", "텅 빈 도시에서 AI 아내만 평소처럼 출근한다."),
 ("jmd",  "재벌가 막내딸이 살인 예고를 받았다", "웹소설/재벌가 막내딸이 살인 예고를 받았다.png", "WEBNOVEL", "재벌 · 스릴러", "7일 후 죽는다는 예고장, 범인은 가족 안에 있다."),
 ("jgj",  "전교 꼴찌의 상태창이 미쳤다", "웹소설/전교 꼴찌의 상태창 각성.png", "WEBNOVEL", "학원 · 판타지", "전교 꼴찌에게 레벨 99 상태창이 떴다."),
 ("jdm",  "죽을 때마다 통장에 100억", "웹소설/죽을 때마다 통장에 100억.png", "WEBNOVEL", "현대 판타지", "죽을 때마다 100억이 입금되는 회귀자."),
 ("pmd",  "파문당한 제자가 흑월검을 얻었다", "웹소설/파문당한 제자가 흑월검을 얻었다.png", "WEBNOVEL", "무협 · 성장", "사문에서 쫓겨난 제자가 전설의 흑월검을 손에 넣는다."),
 ("hgd",  "회귀했더니 내 딸이 재벌 회장", "웹소설/회귀한 딸, 재벌 회장.png", "WEBNOVEL", "회귀 · 가족", "20년 뒤로 깨어나 보니 딸이 그룹 회장이 되어 있었다."),
 ("hwa",  "회귀했더니 원수의 아내가 되어 있었다", "웹소설/회귀한 원수의 아내.png", "WEBNOVEL", "로판 · 회귀", "눈을 떠 보니 가문의 원수와 결혼한 뒤였다."),
 ("nch",  "내가 찬 남자가 내일의 남편이다", None, "WEBNOVEL", "현대 로맨스", "소개팅에서 찬 남자가 다음 날 맞선 상대로 나왔다."),
 # 레퍼런스 모션웹툰 (docs/reference/motion-webtoon-편의점마법사, 표지는 영상 제목 화면)
 ("pmb",  "새벽 세시의 편의점 마법사", None, "WEBTOON", "판타지 · 일상", "최종 면접에 떨어진 새벽 세 시, 편의점에서 빛나는 동전을 내민 손님을 만났다."),
]
COVERS: dict[str, str] = {t: f"covers/{slug}.jpg" for slug, t, *_ in CATALOG}
# 1화 원고 이미지 (app/public/episodes)
EPISODE_IMAGES: dict[str, str] = {"악녀인데 남주들이 나를 숭배한다": "episodes/akn-1@3.jpg", "청월도": "episodes/cwd-1@2.jpg",
                                  "시골에선 슬로우라이프": "episodes/sgl-1@4.jpg",
                                  "새벽 세시의 편의점 마법사": "episodes/pmb-1@22.jpg"}  # 세로 스크롤 원고 22장 (docs/reference/webtoon-편의점마법사-1화)
# 쇼츠 영상 (app/public/shorts). nch 는 드라이브 원본, 나머지는 app/scripts/make_demo_shorts.py 로 만든 모션코믹 시연용
SHORT_VIDEOS: dict[str, tuple[str, int]] = {
    "새벽 세시의 편의점 마법사": ("shorts/pmb.mp4", 160),
    "내가 찬 남자가 내일의 남편이다": ("shorts/nch.mp4", 60),
    "악녀인데 남주들이 나를 숭배한다": ("shorts/akn.mp4", 30),
    "청월도": ("shorts/cwd.mp4", 30),
    "시골에선 슬로우라이프": ("shorts/sgl.mp4", 36),
}


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

        def make_work(title: str, genre: str, n_eps: int, wtype: str = "WEBTOON", cover: str | None = None,
                      synopsis: str | None = None) -> int:
            w = call("creator", "post", "/works", json={"title": title, "type": wtype, "genre": genre,
                                                        "synopsis": synopsis or f"{title} (데모)", "rights_declared": True,
                                                        "cover_url": cover})
            for i in range(1, n_eps + 1):
                call("creator", "post", f"/works/{w['id']}/episodes",
                     json={"no": i, "title": f"{i}화", "content_url": (EPISODE_IMAGES.get(title) if i == 1 else None)
                           or f"https://cdn.example/{w['id']}/{i}"})
            video, dur = SHORT_VIDEOS.get(title, (f"https://cdn.example/{w['id']}/short.mp4", 58))
            call("creator", "post", f"/works/{w['id']}/shorts",
                 json={"title": f"{title} 1분 티저", "video_url": video, "duration_sec": dur})
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
        a = make_work("악녀인데 남주들이 나를 숭배한다", "로맨스 판타지", 14, cover=COVERS.get("악녀인데 남주들이 나를 숭배한다"),
                      synopsis="소설 속 악녀로 눈을 떴는데, 원작 남주들이 하나같이 나를 숭배한다.")
        seed_pilot_events(a, 32_000, 0.85, 0.55)
        for r in readers[:3]:
            call(r, "put", f"/works/{a}/dib")
        call("creator", "patch", "/me", json={"bio": "로맨스 판타지를 그리는 신인 작가"})
        for ep in call("creator", "get", f"/works/{a}/episodes")[3:]:  # 4화부터 유료 미리보기
            call("admin", "patch", f"/admin/episodes/{ep['id']}/pricing", json={"is_paid": True})
        seed_paying_fans(a, 5_200)  # 유료 팬 5,200명 → 목표 금액 상한 1,500만 원
        fa = make_funding(a, 15000, [{"title": "에필로그 크레딧 등재", "min_units": 10},
                                     {"title": "한정판 양장본 + 넘버링 카드", "min_units": 300, "limited_qty": 50,
                                     "requires_shipping": True}])
        for r in readers[:29]:  # 29명 × 750 = 21,750조각 (145%), 1인 한도 750조각 = 75만 원 (1조각 1,000원)
            call(r, "post", f"/fundings/{fa}/subscriptions", json={**SUB, "units": 750})

        # 작품 B: 상장 + 거래
        b = make_work("청월도", "무협", 8, cover=COVERS.get("청월도"), synopsis="달빛이 푸른 밤, 멸문한 가문의 막내가 검을 든다.")
        seed_pilot_events(b, 20_000, 0.8, 0.5)
        for ep in call("creator", "get", f"/works/{b}/episodes")[3:]:
            call("admin", "patch", f"/admin/episodes/{ep['id']}/pricing", json={"is_paid": True})
        seed_paying_fans(b, 3_500)  # 유료 팬 3,500명 → 상한 1,000만 원
        for r in readers[3:6]:
            call(r, "put", f"/works/{b}/dib")  # 모집 전 찜 → 초기 독자 우선 배정
        fb = make_funding(b, 10000, [])
        for r in readers[:25]:  # 25명 × 500 = 12,500조각 (125%), 1인 한도 500조각 = 50만 원
            call(r, "post", f"/fundings/{fb}/subscriptions", json={**SUB, "units": 500})
        call("admin", "post", f"/admin/fundings/{fb}/close", params={"force": True})
        call("admin", "post", f"/admin/fundings/{fb}/issuance", json={"broker_name": "제휴증권(모의)"})
        for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS0000002", "trustee": "모의신탁"}),
                            ("LISTING_SCHEDULED", {"listing_date": clock.now().date().isoformat()}), ("LISTED", {})]:
            call("admin", "post", f"/admin/fundings/{fb}/issuance/advance", json={"step": step, **extra})
        order = {"funding_id": fb, "agree_risk_notice": True}
        call("reader1", "post", "/market/orders", json={**order, "side": "SELL", "price": 1_150, "units": 100})
        call("reader2", "post", "/market/orders", json={**order, "side": "BUY", "price": 1_150, "units": 60})
        call("reader3", "post", "/market/orders", json={**order, "side": "SELL", "price": 1_200, "units": 50})
        call("reader4", "post", "/market/orders", json={**order, "side": "BUY", "price": 1_100, "units": 80})
        b_eps = call("creator", "get", f"/works/{b}/episodes")
        for r in readers[5:15]:  # 상장 후 유료 구매 → 신탁 계좌로 바로 분할 (공시 대사 시연)
            call(r, "post", f"/episodes/{b_eps[4]['id']}/unlock")

        call("creator", "post", f"/works/{b}/posts", json={"kind": "BOARD", "body": "9화는 다음 주 화요일에 올라와요"})
        call("reader1", "post", f"/works/{b}/posts", json={"kind": "HOLDER_BOARD", "body": "첫 분기 배당 기대돼요"})
        call("admin", "post", "/admin/notices", json={"title": "매일 04:00~04:30 마켓 점검", "body": "점검 중에는 주문할 수 없어요.",
                                                     "category": "MAINTENANCE", "is_pinned": True})

        # 추가 작품: 모집 중 펀딩 여러 개 (달성률·마감일·형식이 서로 다르게). 표지는 COVERS 에 있으면 쓴다
        extra = [
            ("이세계 맛집 사장님", "요리 · 이세계", "WEBTOON", 10000, 13, 3, "이세계로 떨어진 동네 분식집 사장이 마왕군 단골을 만든다."),
            ("죽은 줄 알았던 남편이 내 상사로 돌아왔다", "현대 로맨스", "WEBNOVEL", 10000, 9, 5, "장례식 1년 뒤, 새 본부장으로 나타난 남편."),
            ("그날, 사건이 시작됐다", "미스터리 · 추리", "WEBTOON", 12000, 6, 12, "작은 섬마을 고등학교에서 사라진 졸업 앨범."),
            ("황태자의 가짜 신부는 사실 살인자였다", "로판 · 스릴러", "WEBNOVEL", 10000, 11, 8, "가짜 신부로 들어간 암살자가 황태자에게 들킨다."),
            ("우리 반은 전셜입니다", "학원 · 코미디", "WEBTOON", 10000, 14, 2, "전설의 영웅들이 같은 반 고등학생으로 환생했다."),
            ("시골에선 슬로우라이프", "힐링 · 일상", "WEBTOON", 10000, 4, 10, "번아웃 직장인의 귀촌 1년 기록."),
        ]
        for i, (title, genre, wtype, target, subscribers, days, syn) in enumerate(extra):
            wid = make_work(title, genre, 10, wtype, COVERS.get(title), syn)
            for ep in call("creator", "get", f"/works/{wid}/episodes")[3:]:
                call("admin", "patch", f"/admin/episodes/{ep['id']}/pricing", json={"is_paid": True})
            seed_paying_fans(wid, 3_600 + i * 400)
            for r in readers[6 + i: 9 + i] + (["reader1"] if days <= 2 else []):  # reader1: 마감 임박 찜 알림 시연
                call(r, "put", f"/works/{wid}/dib")
            now = clock.now()
            start = now - timedelta(days=max(0, 7 - days))  # 모집 기간은 7일 이상: 마감이 가까운 것은 일찍 연 것으로
            f = call("creator", "post", f"/works/{wid}/fundings", json={
                "target_units": target, "open_at": start.isoformat(), "close_at": (now + timedelta(days=days)).isoformat(),
                "use_of_funds": "작화 외주 60% · 편집 20% · 마케팅 20%", "reward_tiers": []})
            call("admin", "post", f"/admin/fundings/{f['id']}/review", json={"approve": True, "terms": {}})
            call("admin", "post", f"/admin/fundings/{f['id']}/open")
            for r in readers[10: 10 + subscribers]:
                call(r, "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": 400})

        UPCOMING = {"새벽 세시의 편의점 마법사": 4}
        # 나머지 카탈로그: 펀딩 없이 작품만 (탐색·랭킹용). 찜 수는 서로 다르게
        done = {"악녀인데 남주들이 나를 숭배한다", "청월도", *(t for t, *_ in extra)}
        rest = [row for row in CATALOG if row[1] not in done]
        for k, (_slug, title, _src, wtype, genre, syn) in enumerate(rest):
            wid = make_work(title, genre, 3 + k % 5, wtype, COVERS.get(title), syn)
            for r in readers[: (k * 7) % 23]:
                call(r, "put", f"/works/{wid}/dib")
            if title in UPCOMING:  # 공모 예정 (승인 완료, 모집 시작 전)
                now = clock.now()
                f = call("creator", "post", f"/works/{wid}/fundings", json={
                    "target_units": 10000, "open_at": (now + timedelta(days=UPCOMING[title])).isoformat(),
                    "close_at": (now + timedelta(days=UPCOMING[title] + 10)).isoformat(),
                    "use_of_funds": "작화 외주 60% · 편집 20% · 마케팅 20%", "reward_tiers": []})
                call("admin", "post", f"/admin/fundings/{f['id']}/review", json={"approve": True, "terms": {}})

        # 마감 임박 알림 (매일 돌리는 작업을 시연 시점에 한 번 실행)
        print("마감 임박 알림:", call("admin", "post", "/admin/jobs/deadline-reminders"))

        print(f"작품 A id={a}, 펀딩 id={fa} (모집 중)")
        print(f"작품 B id={b}, 종목 id={fb} (상장)")
        print("로그인: POST /auth/dev-login {\"email\": \"reader1@dibs.dev\"}")


if __name__ == "__main__":
    main()
