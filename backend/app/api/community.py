"""작품 커뮤니티 (프로토타입 08 작품·작가·커뮤니티, 03 숏츠 댓글).

v3.0 커뮤니티 정책
- 투자자에게 창작 개입권은 없다. 개입·압박은 신고 사유(CREATIVE_PRESSURE)로 받는다.
- 주주 게시판(HOLDER_BOARD)은 작품 댓글과 분리하고, 해당 종목 보유자만 쓰고 읽는다.
- 신고 3건이 쌓이면 자동으로 숨기고 운영자가 확인한다.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import Conflict, DomainError, Forbidden, NotFound
from app.core.security import current_user, optional_user
from app.models import Episode, Funding, Holding, Post, PostReport, Short, User, UserBlock, Work
from app.models.enums import FundingStatus, PostKind, Role
from app.schemas.common import OK
from app.schemas.community import PostIn, PostOut, ReplyIn, ReportIn, ReportOut
from app.services import content as content_svc

router = APIRouter(tags=["community"])
AUTO_HIDE_REPORTS = 3


def is_holder(db: Session, user: User | None, work_id: int) -> bool:
    if user is None:
        return False
    return bool(db.scalar(select(func.count()).select_from(Holding).join(Funding, Funding.id == Holding.funding_id).where(
        Holding.user_id == user.id, Holding.units > 0, Funding.work_id == work_id,
        Funding.status.in_([FundingStatus.LISTED, FundingStatus.SUSPENDED, FundingStatus.MATURED]))))


def _check_holder_board(db: Session, user: User | None, work: Work) -> None:
    if user and (user.role == Role.ADMIN or user.id == work.creator_id):
        return
    if not is_holder(db, user, work.id):
        raise Forbidden("HOLDERS_ONLY", "이 작품 조각을 가진 주주만 볼 수 있어요")


def to_out(db: Session, posts: list[Post], work: Work) -> list[PostOut]:
    if not posts:
        return []
    ids = [p.id for p in posts]
    counts = dict(db.execute(select(Post.parent_id, func.count()).where(
        Post.parent_id.in_(ids), Post.is_hidden.is_(False), Post.is_deleted.is_(False)).group_by(Post.parent_id)).all())
    names = dict(db.execute(select(User.id, User.nickname).where(User.id.in_({p.author_id for p in posts}))).all())
    return [PostOut(id=p.id, kind=p.kind, work_id=p.work_id, episode_id=p.episode_id, short_id=p.short_id,
                    parent_id=p.parent_id, author_id=p.author_id, author_nickname=names.get(p.author_id, ""),
                    is_creator=p.author_id == work.creator_id, body=p.body, image_url=p.image_url,
                    reply_count=counts.get(p.id, 0), created_at=p.created_at) for p in posts]


def _visible(db: Session, stmt, viewer: User | None):
    stmt = stmt.where(Post.is_hidden.is_(False), Post.is_deleted.is_(False))
    if viewer:
        blocked = select(UserBlock.blocked_id).where(UserBlock.user_id == viewer.id)
        stmt = stmt.where(Post.author_id.not_in(blocked))
    return stmt


@router.get("/works/{work_id}/posts", response_model=list[PostOut], summary="작품 글 목록 (댓글·게시판·팬아트·주주 게시판)")
def list_posts(work_id: int, kind: PostKind, episode_id: int | None = None, short_id: int | None = None,
               limit: int = Query(default=30, le=100), offset: int = 0,
               db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    work = content_svc.get_work(db, work_id, user)
    if kind == PostKind.HOLDER_BOARD:
        _check_holder_board(db, user, work)
    stmt = select(Post).where(Post.work_id == work.id, Post.kind == kind, Post.parent_id.is_(None))
    if episode_id:
        stmt = stmt.where(Post.episode_id == episode_id)
    if short_id:
        stmt = stmt.where(Post.short_id == short_id)
    posts = list(db.scalars(_visible(db, stmt, user).order_by(Post.id.desc()).limit(limit).offset(offset)))
    return to_out(db, posts, work)


@router.post("/works/{work_id}/posts", response_model=PostOut, status_code=201, summary="글 쓰기")
def create_post(work_id: int, body: PostIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    work = content_svc.get_work(db, work_id, user)
    if body.kind == PostKind.EPISODE_COMMENT:
        ep = db.get(Episode, body.episode_id) if body.episode_id else None
        if ep is None or ep.work_id != work.id:
            raise DomainError("EPISODE_REQUIRED", "댓글을 달 회차를 지정해 주세요")
    if body.kind == PostKind.SHORT_COMMENT:
        sh = db.get(Short, body.short_id) if body.short_id else None
        if sh is None or sh.work_id != work.id:
            raise DomainError("SHORT_REQUIRED", "댓글을 달 숏츠를 지정해 주세요")
    if body.kind == PostKind.BOARD and user.id != work.creator_id and user.role != Role.ADMIN:
        raise Forbidden("CREATOR_ONLY", "작가 게시판 글은 작가만 쓸 수 있어요. 답글로 참여해 주세요")
    if body.kind == PostKind.FANART and not body.image_url:
        raise DomainError("IMAGE_REQUIRED", "팬아트 이미지를 올려 주세요")
    if body.kind == PostKind.HOLDER_BOARD:
        _check_holder_board(db, user, work)
    p = Post(work_id=work.id, author_id=user.id, **body.model_dump())
    db.add(p)
    db.flush()
    return to_out(db, [p], work)[0]


def _post(db: Session, post_id: int) -> tuple[Post, Work]:
    p = db.get(Post, post_id)
    if p is None or p.is_deleted:
        raise NotFound("POST_NOT_FOUND", "글을 찾을 수 없어요")
    return p, db.get(Work, p.work_id)


@router.get("/posts/{post_id}/replies", response_model=list[PostOut], summary="답글 목록")
def replies(post_id: int, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    p, work = _post(db, post_id)
    if p.kind == PostKind.HOLDER_BOARD:
        _check_holder_board(db, user, work)
    stmt = select(Post).where(Post.parent_id == p.id)
    return to_out(db, list(db.scalars(_visible(db, stmt, user).order_by(Post.id))), work)


@router.post("/posts/{post_id}/replies", response_model=PostOut, status_code=201, summary="답글 쓰기")
def reply(post_id: int, body: ReplyIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p, work = _post(db, post_id)
    if p.parent_id:
        raise Conflict("NESTED_REPLY", "답글에는 답글을 달 수 없어요")
    if p.kind == PostKind.HOLDER_BOARD:
        _check_holder_board(db, user, work)
    r = Post(kind=p.kind, work_id=p.work_id, episode_id=p.episode_id, short_id=p.short_id, parent_id=p.id,
             author_id=user.id, body=body.body)
    db.add(r)
    db.flush()
    return to_out(db, [r], work)[0]


@router.delete("/posts/{post_id}", response_model=OK, summary="글 삭제 (작성자·운영자)")
def delete_post(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p, _ = _post(db, post_id)
    if p.author_id != user.id and user.role != Role.ADMIN:
        raise Forbidden("NOT_AUTHOR", "내가 쓴 글만 지울 수 있어요")
    p.is_deleted = True
    return OK()


@router.post("/posts/{post_id}/report", response_model=ReportOut, summary="신고 (3건이면 자동 숨김)")
def report(post_id: int, body: ReportIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p, _ = _post(db, post_id)
    if p.author_id == user.id:
        raise Conflict("SELF_REPORT", "내 글은 신고할 수 없어요")
    if db.scalar(select(PostReport.id).where(PostReport.post_id == p.id, PostReport.reporter_id == user.id)):
        raise Conflict("ALREADY_REPORTED", "이미 신고한 글이에요")
    db.add(PostReport(post_id=p.id, reporter_id=user.id, reason=body.reason))
    db.flush()
    n = db.scalar(select(func.count()).where(PostReport.post_id == p.id))
    if n >= AUTO_HIDE_REPORTS:
        p.is_hidden = True
    return ReportOut(post_id=p.id, report_count=n, hidden=p.is_hidden)


@router.put("/users/{user_id}/block", response_model=OK, summary="차단 (그 사람 글이 안 보임)")
def block(user_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user_id == user.id or db.get(User, user_id) is None:
        raise DomainError("INVALID_BLOCK", "차단할 수 없는 사용자예요")
    if not db.scalar(select(UserBlock.id).where(UserBlock.user_id == user.id, UserBlock.blocked_id == user_id)):
        db.add(UserBlock(user_id=user.id, blocked_id=user_id))
    return OK()


@router.delete("/users/{user_id}/block", response_model=OK, summary="차단 해제")
def unblock(user_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    b = db.scalar(select(UserBlock).where(UserBlock.user_id == user.id, UserBlock.blocked_id == user_id))
    if b:
        db.delete(b)
    return OK()
