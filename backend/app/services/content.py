from datetime import timedelta

from app.core import clock
from app.core.config import settings

from sqlalchemy import String, cast, distinct, func, literal, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, DomainError, Forbidden, NotFound
from app.models import ContentEvent, Dib, Episode, EpisodeUnlock, Funding, User, Work
from app.models.enums import AccountKind, EventType, FundingStatus, Role, WorkStatus
from app.services import ledger
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


def is_listed(db: Session, work_id: int) -> bool:
    return db.scalar(select(func.count()).where(
        Funding.work_id == work_id, Funding.status.in_([FundingStatus.LISTED, FundingStatus.SUSPENDED]))) > 0


def live_funding(db: Session, work_id: int) -> Funding | None:
    """매출이 투자자에게 배분되는 펀딩 (상장·거래정지 상태). 시즌이 끝나 종료되면 None."""
    return db.scalar(select(Funding).where(Funding.work_id == work_id, Funding.listed_at.is_not(None),
                                           Funding.status.in_([FundingStatus.LISTED, FundingStatus.SUSPENDED]))
                     .order_by(Funding.listed_at.desc()).limit(1))


def can_read(db: Session, ep: Episode, user: User | None) -> bool:
    if not ep.is_paid:
        return True
    if user is None:
        return False
    if user.role == Role.ADMIN or ep.work.creator_id == user.id:
        return True
    return db.scalar(select(func.count()).where(EpisodeUnlock.user_id == user.id, EpisodeUnlock.episode_id == ep.id)) > 0


def unlock_episode(db: Session, user: User, ep: Episode) -> EpisodeUnlock:
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
    u = EpisodeUnlock(user_id=user.id, episode_id=ep.id, work_id=ep.work_id, price_coin=ep.price_coin, journal_id=j.id,
                      funding_id=live.id if live else None)
    db.add(u)
    db.flush()
    return u


def set_episode_pricing(db: Session, ep: Episode, is_paid: bool, price_coin: int) -> Episode:
    """v4.0: 파일럿 1~3화는 무료. 4화부터 유료 미리보기(기본 300원)로 지정할 수 있고, 공개 21일 뒤 무료가 된다.
    발행 전·후 모두 적용된다 (발행 전 순매출은 작가 70 / DIBS 30, 상장 후는 배당 재원)."""
    if is_paid and ep.no <= settings.pilot_free_episodes:
        raise Conflict("PILOT_FREE", f"파일럿 {settings.pilot_free_episodes}화까지는 무료예요")
    price = (price_coin or settings.default_preview_price_coin) if is_paid else 0
    ep.paid_preview, ep.price_coin = is_paid, price
    ep.free_unlock_at = (ep.created_at or clock.now()) + timedelta(days=settings.preview_free_after_days) if is_paid else None
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
        "detail_views": db.scalar(select(func.count()).where(ContentEvent.work_id == work.id,
                                                             ContentEvent.event_type == EventType.WORK_VIEW)),
        "unique_readers": uniq(EventType.VIEW_START),
        "dibs": dib_count(db, work.id),
        "short_plays": uniq(EventType.SHORT_PLAY),
        "funding_cta_clicks": uniq(EventType.FUNDING_CTA),
        "episodes": per_ep,
    }


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
