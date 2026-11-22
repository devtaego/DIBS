import math
from datetime import timedelta

from app.core import clock
from app.core.config import settings

from sqlalchemy import String, cast, distinct, func, literal, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, DomainError, Forbidden, NotFound
from app.models import ContentEvent, Dib, Episode, EpisodeUnlock, Funding, User, Work
from app.models.enums import AccountKind, EventType, FundingStatus, Role, WorkStatus
from app.services import coins, ledger
from app.services.ledger import Leg
from app.services.wallet import COIN_MODE


def get_work(db: Session, work_id: int, viewer: User | None = None) -> Work:
    w = db.get(Work, work_id)
    if w is None:
        raise NotFound("WORK_NOT_FOUND", "작품을 찾을 수 없어요")
    is_owner_or_admin = viewer and (viewer.role == Role.ADMIN or viewer.id == w.creator_id)
    if w.status != WorkStatus.PUBLISHED and not is_owner_or_admin:
        raise NotFound("WORK_NOT_FOUND", "작품을 찾을 수 없어요")
    return w


def require_owner(work: Work, user: User) -> None:
    if user.role != Role.ADMIN and work.creator_id != user.id:
        raise Forbidden("NOT_WORK_OWNER", "내 작품만 관리할 수 있어요")


DISPLAY_BY_FUNDING = {
    FundingStatus.OPEN: "FUNDING", FundingStatus.FAILED: "FUNDING_FAILED", FundingStatus.ALLOCATED: "ISSUING",
    FundingStatus.ISSUING: "ISSUING", FundingStatus.ISSUE_FAILED: "PUBLISHED", FundingStatus.LISTED: "LISTED",
    FundingStatus.SUSPENDED: "HALTED", FundingStatus.TERMINATED: "DELISTED",
}


def display_status(work: Work, funding: Funding | None) -> str:
    """기획서 3-1의 작품 상태(11개)를 작품 상태 + 최근 펀딩 상태에서 계산한다."""
    if work.status != WorkStatus.PUBLISHED or funding is None:
        return str(work.status)
    return DISPLAY_BY_FUNDING.get(funding.status, "PUBLISHED")


def is_listed(db: Session, work_id: int) -> bool:
    return db.scalar(select(func.count()).where(
        Funding.work_id == work_id, Funding.status.in_([FundingStatus.LISTED, FundingStatus.SUSPENDED]))) > 0


def live_funding(db: Session, work_id: int) -> Funding | None:
    """매출이 투자자에게 배분되는 펀딩 (상장·거래정지 상태). 시즌이 끝나 종료되면 None."""
    return db.scalar(select(Funding).where(Funding.work_id == work_id, Funding.listed_at.is_not(None),
                                           Funding.status.in_([FundingStatus.LISTED, FundingStatus.SUSPENDED]))
                     .order_by(Funding.listed_at.desc()).limit(1))


def check_age(ep: Episode, user: User | None) -> None:
    """19세 작품은 본인인증으로 만 19세 이상이 확인된 회원만 회차를 연다 (기획서 3-1). 작품 상세는 누구나 본다."""
    if ep.work.age_rating != "19":
        return
    if user is not None and (user.role == Role.ADMIN or ep.work.creator_id == user.id):
        return
    if user is None or not user.kyc_verified or not user.is_adult(clock.now().date()):
        raise Forbidden("ADULT_ONLY", "19세 이상 본인인증 회원만 볼 수 있어요")


def can_read(db: Session, ep: Episode, user: User | None) -> bool:
    check_age(ep, user)
    if not ep.is_paid:
        return True
    if user is None:
        return False
    if user.role == Role.ADMIN or ep.work.creator_id == user.id:
        return True
    return db.scalar(select(func.count()).where(EpisodeUnlock.user_id == user.id, EpisodeUnlock.episode_id == ep.id)) > 0


def unlock_episode(db: Session, user: User, ep: Episode) -> EpisodeUnlock:
    check_age(ep, user)
    if not ep.is_paid:
        raise DomainError("EPISODE_FREE", "무료 회차예요")
    existing = db.scalar(select(EpisodeUnlock).where(EpisodeUnlock.user_id == user.id, EpisodeUnlock.episode_id == ep.id))
    if existing:
        return existing
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    # 결제 시점 분할: 상장 중인 작품의 매출은 DIBS 매출 계정을 거치지 않고 신탁 계좌로 바로 들어간다
    live = live_funding(db, ep.work_id)
    dest = AccountKind.SYS_TRUST_RECEIVABLE if live else AccountKind.SYS_COIN_REVENUE
    j = ledger.post(db, "EPISODE_UNLOCK", [Leg(coin, -ep.price_coin), Leg(ledger.sys(db, dest, COIN_MODE), ep.price_coin)],
                    COIN_MODE, "episode", ep.id, memo=f"trust:funding:{live.id}" if live else None)
    coins.consume(db, user.id, ep.price_coin)
    u = EpisodeUnlock(user_id=user.id, episode_id=ep.id, work_id=ep.work_id, price_coin=ep.price_coin, journal_id=j.id,
                      funding_id=live.id if live else None)
    db.add(u)
    db.flush()
    return u


def set_episode_pricing(db: Session, ep: Episode, is_paid: bool, price_coin: int, free_unlock_at=None) -> Episode:
    """v4.0: 파일럿 1~3화는 무료. 4화부터 유료 미리보기(기본 300원)로 지정할 수 있고, 공개 21일 뒤 무료가 된다.
    발행 전·후 모두 적용된다 (발행 전 순매출은 작가 70 / DIBS 30, 상장 후는 배당 재원)."""
    if is_paid and ep.no <= settings.pilot_free_episodes:
        raise Conflict("PILOT_FREE", f"파일럿 {settings.pilot_free_episodes}화까지는 무료예요")
    if is_paid and not settings.paid_preview_before_listing and not is_listed(db, ep.work_id):
        raise Conflict("NOT_LISTED_YET", "유료 미리보기는 상장 후에 열 수 있어요. 상장 전 공개 회차는 무료예요")
    price = (price_coin or settings.default_preview_price_coin) if is_paid else 0
    ep.paid_preview, ep.price_coin = is_paid, price
    # 정식 공개 시각(무료 전환)은 작가가 예약한 값을 쓰고, 없으면 공개 21일 뒤 (기획서 3-2)
    if not is_paid:
        ep.free_unlock_at = None
    elif free_unlock_at is not None:
        if free_unlock_at <= clock.now():
            raise DomainError("INVALID_FREE_AT", "정식 공개 시각은 지금보다 뒤여야 해요")
        ep.free_unlock_at = free_unlock_at
    else:
        ep.free_unlock_at = (ep.created_at or clock.now()) + timedelta(days=settings.preview_free_after_days)
    return ep


def pre_issuance_settlement(db: Session, work: Work, since, until) -> dict:
    """발행 전(상장 전) 유료 미리보기 순매출 정산: 인앱 수수료 30% 공제 후 작가 70 / DIBS 30."""
    listed_at = db.scalar(select(func.min(Funding.listed_at)).where(Funding.work_id == work.id))
    end = min(until, listed_at) if listed_at else until
    gross = int(db.scalar(select(func.coalesce(func.sum(EpisodeUnlock.price_coin), 0)).where(
        EpisodeUnlock.work_id == work.id, EpisodeUnlock.unlocked_at >= since, EpisodeUnlock.unlocked_at < end)))
    net = gross - gross * settings.inapp_fee_bps // 10000
    creator = net * settings.pre_issuance_creator_bps // 10000
    return {"work_id": work.id, "gross": gross, "inapp_fee": gross - net, "net": net,
            "creator_amount": creator, "platform_amount": net - creator,
            "creator_bps": settings.pre_issuance_creator_bps}


def toggle_dib(db: Session, user: User, work: Work, on: bool) -> bool:
    d = db.scalar(select(Dib).where(Dib.user_id == user.id, Dib.work_id == work.id))
    if on and d is None:
        db.add(Dib(user_id=user.id, work_id=work.id))
    elif not on and d is not None:
        db.delete(d)
    db.flush()
    return on


def dib_count(db: Session, work_id: int) -> int:
    return db.scalar(select(func.count()).where(Dib.work_id == work_id))


def work_metrics(db: Session, work: Work) -> dict:
    """작품 지표. 연독률(episode n) = n화 완독 고유 사용자 / 1화 완독 고유 사용자."""
    # 로그인 사용자는 user_id, 비로그인은 anon_id 로 고유 사용자 식별 (충돌 방지 접두사)
    viewer = func.coalesce(literal("u") + cast(ContentEvent.user_id, String), literal("a") + ContentEvent.anon_id)

    def uniq(event_type: EventType, episode_id: int | None = None) -> int:
        q = select(func.count(distinct(viewer))).where(ContentEvent.work_id == work.id,
                                                       ContentEvent.event_type == event_type)
        if episode_id is not None:
            q = q.where(ContentEvent.episode_id == episode_id)
        return db.scalar(q)

    episodes = list(db.scalars(select(Episode).where(Episode.work_id == work.id).order_by(Episode.no)))
    per_ep, base = [], None
    for ep in episodes:
        starts, completes = uniq(EventType.VIEW_START, ep.id), uniq(EventType.VIEW_COMPLETE, ep.id)
        if base is None:
            base = completes
        per_ep.append({
            "episode_id": ep.id, "no": ep.no, "unique_starts": starts, "unique_completes": completes,
            "completion_rate": round(completes / starts, 4) if starts else None,
            "read_through_rate": round(completes / base, 4) if base else None,
        })
    return {
        "work_id": work.id,
        **reader_change_1w(db, work.id),
        "detail_views": db.scalar(select(func.count()).where(ContentEvent.work_id == work.id,
                                                             ContentEvent.event_type == EventType.WORK_VIEW)),
        "unique_readers": uniq(EventType.VIEW_START),
        "dibs": dib_count(db, work.id),
        "short_plays": uniq(EventType.SHORT_PLAY),
        "funding_cta_clicks": uniq(EventType.FUNDING_CTA),
        "episodes": per_ep,
    }


def first_read_at(db: Session, work_id: int):
    """이 작품 회차가 처음 열린 시각 (VIEW_START 최초). 데이터가 없으면 None."""
    return db.scalar(select(func.min(ContentEvent.occurred_at)).where(
        ContentEvent.work_id == work_id, ContentEvent.event_type == EventType.VIEW_START))


def reader_change_1w(db: Session, work_id: int) -> dict:
    """v_work_metrics_pre.reader_change_1w (데이터팀 정의):
    직전 7일 대비 최근 7일 회차 뷰어(VIEW_START, 이벤트 코드 1102) 순독자 변화율 = (최근 − 직전) ÷ 직전.
    직전 7일 순독자가 0명이면 null. 기준 시각은 이벤트 발생 시각(occurred_at).
    tracked_days = 첫 열람부터 지금까지 24시간 구간 수 (데이터가 없으면 0). 14 이하면 직전 7일이 다 차지 않은 것이라
    화면은 증가율 대신 '비교 전'으로 보여 준다 (값 자체는 데이터팀 정의대로 계산)."""
    viewer = func.coalesce(literal("u") + cast(ContentEvent.user_id, String), literal("a") + ContentEvent.anon_id)
    now = clock.now()
    first = first_read_at(db, work_id)
    # 첫 열람부터 지금까지 24시간 구간 수 (하루 독자 막대 개수와 같은 셈법)
    tracked = math.ceil((now - first).total_seconds() / 86400) if first else 0

    def readers(start, end) -> int:
        return db.scalar(select(func.count(distinct(viewer))).where(
            ContentEvent.work_id == work_id, ContentEvent.event_type == EventType.VIEW_START,
            ContentEvent.occurred_at >= start, ContentEvent.occurred_at < end)) or 0

    recent = readers(now - timedelta(days=7), now)
    prev = readers(now - timedelta(days=14), now - timedelta(days=7))
    return {"readers_last_7d": recent, "readers_prev_7d": prev, "tracked_days": tracked,
            "reader_change_1w": round((recent - prev) / prev, 3) if prev else None}


def daily_readers(db: Session, work_ids: list[int], days: int = 7) -> dict[int, list[dict]]:
    """작품별 하루 순독자 (VIEW_START 고유 독자). 오늘을 끝으로 최대 `days`일, 지금 시각부터 거꾸로 24시간씩 끊는다
    (마지막 = 최근 24시간 = '오늘'). 그래서 오전에 봐도 오늘 막대가 덜 찬 것처럼 낮아지지 않는다.
    공개한 지 3일이면 3일치만 준다 (첫 열람 전 구간은 빼고, 공개 뒤 아무도 안 본 날은 0).
    여러 작품을 구간마다 묶음 쿼리 한 번으로 센다 (펀딩 목록 카드용)."""
    if not work_ids:
        return {}
    viewer = func.coalesce(literal("u") + cast(ContentEvent.user_id, String), literal("a") + ContentEvent.anon_id)
    now = clock.now()
    firsts = dict(db.execute(select(ContentEvent.work_id, func.min(ContentEvent.occurred_at))
                             .where(ContentEvent.work_id.in_(work_ids), ContentEvent.event_type == EventType.VIEW_START)
                             .group_by(ContentEvent.work_id)).all())
    out: dict[int, list[dict]] = {w: [] for w in work_ids}
    for i in range(days):
        end = now - timedelta(days=days - 1 - i)
        start = end - timedelta(days=1)
        got = dict(db.execute(select(ContentEvent.work_id, func.count(distinct(viewer)))
                              .where(ContentEvent.work_id.in_(work_ids), ContentEvent.event_type == EventType.VIEW_START,
                                     ContentEvent.occurred_at >= start, ContentEvent.occurred_at < end)
                              .group_by(ContentEvent.work_id)).all())
        for w in work_ids:
            first = firsts.get(w)
            if first is not None and first < end:  # 첫 열람 전 구간은 넣지 않는다
                out[w].append({"date": end.date().isoformat(), "readers": int(got.get(w, 0))})
    return out


def reader_trend(db: Session, work: Work) -> dict:
    """펀딩 상세 '미리보기 반응 지표' 차트: 오늘까지 7일 하루 순독자, 주간 증가율, 무료 회차별 시작·완독 독자."""
    viewer = func.coalesce(literal("u") + cast(ContentEvent.user_id, String), literal("a") + ContentEvent.anon_id)

    def uniq(event: EventType, episode_id: int) -> int:
        return int(db.scalar(select(func.count(distinct(viewer))).where(
            ContentEvent.work_id == work.id, ContentEvent.event_type == event, ContentEvent.episode_id == episode_id)) or 0)

    eps = list(db.scalars(select(Episode).where(Episode.work_id == work.id, Episode.no <= settings.pilot_free_episodes)
                          .order_by(Episode.no)))
    funnel = [{"no": e.no, "starters": uniq(EventType.VIEW_START, e.id), "completes": uniq(EventType.VIEW_COMPLETE, e.id)}
              for e in eps]
    return {"work_id": work.id, "days": daily_readers(db, [work.id], 7)[work.id], **reader_change_1w(db, work.id),
            "episode_funnel": funnel}


def review_metrics(db: Session, work: Work) -> dict:
    """펀딩 심사용 지표 (v3.0): 본인인증 계정 반응만 세고, 조작 의심 신호를 따로 보여 준다."""
    rows = db.execute(select(Dib.user_id, Dib.created_at, User.kyc_verified, User.created_at)
                      .join(User, User.id == Dib.user_id).where(Dib.work_id == work.id).order_by(Dib.created_at)).all()
    readers = set(db.scalars(select(ContentEvent.user_id).where(
        ContentEvent.work_id == work.id, ContentEvent.event_type == EventType.VIEW_COMPLETE,
        ContentEvent.user_id.is_not(None))))
    verified = [r for r in rows if r[2]]
    no_read = [r for r in verified if r[0] not in readers]
    new_acct = [r for r in verified if r[1] - r[3] < timedelta(hours=24)]
    times = [r[1] for r in rows]
    burst, j = 0, 0
    for i, t in enumerate(times):  # 1시간 창 안의 최대 찜 수
        while times[j] < t - timedelta(hours=1):
            j += 1
        burst = max(burst, i - j + 1)
    eligible = len({r[0] for r in verified} - {r[0] for r in no_read} - {r[0] for r in new_acct})

    def rt(ep_id):
        q = select(ContentEvent.user_id).distinct().join(User, User.id == ContentEvent.user_id).where(
            ContentEvent.work_id == work.id, ContentEvent.episode_id == ep_id,
            ContentEvent.event_type == EventType.VIEW_COMPLETE, User.kyc_verified.is_(True))
        return set(db.scalars(q))

    eps = list(db.scalars(select(Episode).where(Episode.work_id == work.id).order_by(Episode.no)))
    base = rt(eps[0].id) if eps else set()
    per_ep = [{"no": e.no, "verified_completes": len(c := rt(e.id)),
               "verified_read_through_rate": round(len(c & base) / len(base), 4) if base else None} for e in eps]
    flags = []
    if verified and len(no_read) / len(verified) > 0.5:
        flags.append("NO_READ_DIBS_HIGH")  # 완독 없는 찜이 절반 이상
    if rows and burst > max(20, len(rows) * 0.3):
        flags.append("DIB_BURST")  # 1시간 안에 찜이 몰림
    if verified and len(new_acct) / len(verified) > 0.3:
        flags.append("NEW_ACCOUNT_DIBS_HIGH")  # 가입 24시간 안 계정의 찜이 많음
    return {"work_id": work.id, "dibs_total": len(rows), "dibs_verified": len(verified),
            "dibs_without_read": len(no_read), "dibs_from_new_accounts": len(new_acct), "max_dibs_in_1h": burst,
            "eligible_dibs": eligible, "episodes": per_ep, "flags": flags}
