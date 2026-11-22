from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import Conflict, DomainError, NotFound
from app.core.security import creator_only, current_user, optional_user
from app.models import Dib, Episode, EpisodeUnlock, Funding, Short, User, Work
from app.models.enums import FundingStatus, WorkStatus, WorkType
from app.schemas.common import OK
from app.schemas.content import (
    EpisodeContentOut,
    EpisodeIn,
    EpisodeListItem,
    EpisodeOut,
    ShortFeedItem,
    ShortIn,
    ShortOut,
    WorkCardOut,
    WorkDetailOut,
    WorkIn,
    ReaderTrendOut,
    WorkMetricsOut,
    WorkOut,
    WorkPatch,
)
from app.services import content as svc

router = APIRouter(tags=["works"])

FUNDING_VISIBLE = [s for s in FundingStatus if s not in (FundingStatus.DRAFT, FundingStatus.IN_REVIEW,
                                                         FundingStatus.REJECTED)]


def _latest_funding(db: Session, work_id: int) -> Funding | None:
    return latest_fundings(db, [work_id]).get(work_id)


def latest_fundings(db: Session, work_ids: list[int]) -> dict[int, Funding]:
    """작품별 가장 최근 공개 펀딩 (목록 화면 N+1 방지용 일괄 조회)."""
    if not work_ids:
        return {}
    out: dict[int, Funding] = {}
    for f in db.scalars(select(Funding).where(Funding.work_id.in_(work_ids), Funding.status.in_(FUNDING_VISIBLE))
                        .order_by(Funding.id)):
        out[f.work_id] = f
    return out


def dib_counts(db: Session, work_ids: list[int]) -> dict[int, int]:
    if not work_ids:
        return {}
    return dict(db.execute(select(Dib.work_id, func.count()).where(Dib.work_id.in_(work_ids)).group_by(Dib.work_id)).all())


def to_cards(db: Session, works: list[Work]) -> list[WorkCardOut]:
    ids = [w.id for w in works]
    fs, dc = latest_fundings(db, ids), dib_counts(db, ids)
    return [WorkCardOut(**WorkOut.model_validate(w).model_dump(), dib_count=dc.get(w.id, 0),
                        funding_id=fs[w.id].id if w.id in fs else None,
                        funding_status=fs[w.id].status if w.id in fs else None) for w in works]


@router.get("/works", response_model=list[WorkCardOut], summary="작품 목록 (홈 카드: 찜 수·펀딩/상장 상태 포함)")
def list_works(
    type: WorkType | None = None,
    genre: str | None = None,
    q: str | None = Query(default=None, description="제목 검색"),
    sort: str = Query(default="latest", pattern="^(latest|dibs)$"),
    limit: int = Query(default=20, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    stmt = select(Work).where(Work.status == WorkStatus.PUBLISHED)
    if type:
        stmt = stmt.where(Work.type == type)
    if genre:
        stmt = stmt.where(Work.genre == genre)
    if q:
        stmt = stmt.where(Work.title.contains(q))
    if sort == "dibs":
        dibs = select(Dib.work_id, func.count().label("n")).group_by(Dib.work_id).subquery()
        stmt = stmt.outerjoin(dibs, dibs.c.work_id == Work.id).order_by(func.coalesce(dibs.c.n, 0).desc(), Work.id.desc())
    else:
        stmt = stmt.order_by(Work.id.desc())
    return to_cards(db, list(db.scalars(stmt.limit(limit).offset(offset))))


@router.get("/works/{work_id}", response_model=WorkDetailOut, summary="작품 상세")
def get_work(work_id: int, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    w = svc.get_work(db, work_id, user)
    f = _latest_funding(db, w.id)
    dibbed = bool(user and db.scalar(select(Dib.id).where(Dib.user_id == user.id, Dib.work_id == w.id)))
    return WorkDetailOut(
        **WorkOut.model_validate(w).model_dump(), dib_count=svc.dib_count(db, w.id), is_dibbed=dibbed,
        episode_count=len(w.episodes), funding_id=f.id if f else None, funding_status=f.status if f else None,
        display_status=svc.display_status(w, f),
        reader_change_1w=svc.reader_change_1w(db, w.id)["reader_change_1w"],
    )


@router.post("/works", response_model=WorkOut, status_code=201, summary="작품 등록 (창작자)")
def create_work(body: WorkIn, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    if not body.rights_declared:
        raise DomainError("RIGHTS_NOT_DECLARED", "작품 공개 권한을 확인해 주세요")
    w = Work(creator_id=user.id, **body.model_dump())
    db.add(w)
    db.flush()
    return w


@router.patch("/works/{work_id}", response_model=WorkOut, summary="작품 정보 수정")
def patch_work(work_id: int, body: WorkPatch, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    w = svc.get_work(db, work_id, user)
    svc.require_owner(w, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(w, k, v)
    return w


@router.post("/works/{work_id}/submit", response_model=WorkOut, summary="공개 심사 요청")
def submit_work(work_id: int, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    w = svc.get_work(db, work_id, user)
    svc.require_owner(w, user)
    if w.status not in (WorkStatus.DRAFT, WorkStatus.REJECTED):
        raise Conflict("INVALID_WORK_STATUS", "심사를 요청할 수 없는 상태예요")
    if not w.episodes:
        raise DomainError("NO_EPISODES", "회차를 1개 이상 등록해 주세요")
    w.status = WorkStatus.IN_REVIEW
    return w


# ── 회차 ──
@router.get("/works/{work_id}/episodes", response_model=list[EpisodeListItem], summary="회차 목록")
def list_episodes(work_id: int, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    w = svc.get_work(db, work_id, user)
    unlocked = set()
    if user:
        unlocked = set(db.scalars(select(EpisodeUnlock.episode_id).where(EpisodeUnlock.user_id == user.id,
                                                                         EpisodeUnlock.work_id == w.id)))
    return [EpisodeListItem(**EpisodeOut.model_validate(e).model_dump(), unlocked=(not e.is_paid) or e.id in unlocked)
            for e in w.episodes]


@router.post("/works/{work_id}/episodes", response_model=EpisodeOut, status_code=201, summary="회차 등록")
def create_episode(work_id: int, body: EpisodeIn, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    w = svc.get_work(db, work_id, user)
    svc.require_owner(w, user)
    if db.scalar(select(Episode.id).where(Episode.work_id == w.id, Episode.no == body.no)):
        raise Conflict("EPISODE_NO_EXISTS", "같은 회차 번호가 있어요")
    e = Episode(work_id=w.id, **body.model_dump())  # 발행 전에는 항상 무료
    db.add(e)
    db.flush()
    from app.services import serial

    serial.on_episode_published(db, w)  # 상장 작품: 약정 회차 마일스톤 자동 지급, 약정 완료 시 시즌 완결
    return e


def _episode(db: Session, episode_id: int, user: User | None) -> Episode:
    e = db.get(Episode, episode_id)
    if e is None:
        raise NotFound("EPISODE_NOT_FOUND", "회차를 찾을 수 없어요")
    svc.get_work(db, e.work_id, user)  # 비공개 작품 차단
    return e


@router.get("/episodes/{episode_id}", response_model=EpisodeContentOut, summary="회차 열람",
            responses={402: {"description": "PAYMENT_REQUIRED: 유료 회차 미구매"},
                       401: {"description": "LOGIN_REQUIRED: 게스트는 1화까지"}})
def read_episode(episode_id: int, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    e = _episode(db, episode_id, user)
    if user is None and e.no > settings.guest_free_episodes:
        raise DomainError("LOGIN_REQUIRED", "로그인하면 이어서 볼 수 있어요", 401)
    if not svc.can_read(db, e, user):
        seeds = -(-e.price_coin // settings.seed_unit_won)  # 올림
        raise DomainError("PAYMENT_REQUIRED", f"이어서 보려면 씨앗 {seeds}개가 필요해요", 402,
                          data={"episode_id": e.id, "price_coin": e.price_coin, "price_seeds": seeds})
    return e


@router.post("/episodes/{episode_id}/unlock", response_model=EpisodeContentOut, summary="유료 회차 구매 (씨앗)")
def unlock_episode(episode_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    e = _episode(db, episode_id, user)
    svc.unlock_episode(db, user, e)
    return e


# ── 숏츠 ──
@router.post("/works/{work_id}/shorts", response_model=ShortOut, status_code=201, summary="숏츠 등록")
def create_short(work_id: int, body: ShortIn, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    w = svc.get_work(db, work_id, user)
    svc.require_owner(w, user)
    s = Short(work_id=w.id, **body.model_dump())
    db.add(s)
    db.flush()
    return s


@router.get("/works/{work_id}/shorts", response_model=list[ShortOut], summary="작품의 숏츠 목록")
def list_shorts(work_id: int, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    w = svc.get_work(db, work_id, user)
    return list(db.scalars(select(Short).where(Short.work_id == w.id).order_by(Short.id.desc())))


@router.get("/shorts/feed", response_model=list[ShortFeedItem], summary="숏츠 피드 (펀딩 바로가기 포함)")
def shorts_feed(limit: int = Query(default=20, le=50), offset: int = 0, db: Session = Depends(get_db)):
    rows = db.execute(select(Short, Work).join(Work, Work.id == Short.work_id)
                      .where(Work.status == WorkStatus.PUBLISHED).order_by(Short.id.desc())
                      .limit(limit).offset(offset)).all()
    out = []
    for s, w in rows:
        f = _latest_funding(db, w.id)
        out.append(ShortFeedItem(**ShortOut.model_validate(s).model_dump(), work_title=w.title,
                                 funding_id=f.id if f else None, funding_status=f.status if f else None))
    return out


# ── 찜 ──
@router.put("/works/{work_id}/dib", response_model=OK, summary="찜하기")
def dib(work_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    svc.toggle_dib(db, user, svc.get_work(db, work_id, user), True)
    return OK()


@router.delete("/works/{work_id}/dib", response_model=OK, summary="찜 해제")
def undib(work_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    svc.toggle_dib(db, user, svc.get_work(db, work_id, user), False)
    return OK()


@router.get("/works/{work_id}/reader-trend", response_model=ReaderTrendOut,
            summary="독자 추이 (오늘까지 최대 7일 하루 순독자 · 주간 증가율 · 무료 회차별 시작/완독 독자)")
def reader_trend(work_id: int, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    return svc.reader_trend(db, svc.get_work(db, work_id, user))


@router.get("/works/{work_id}/metrics", response_model=WorkMetricsOut, summary="작품 지표 (창작자·운영자)")
def metrics(work_id: int, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    w = svc.get_work(db, work_id, user)
    svc.require_owner(w, user)
    return svc.work_metrics(db, w)
