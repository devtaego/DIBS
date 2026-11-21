"""작가 프로필, 공지사항(종목 공시 포함), 약관·고지 문서 (프로토타입 07 MY·설정, 08 작가 프로필)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.works import to_cards
from app.core.db import get_db
from app.core.errors import NotFound
from app.models import Notice, User, Work
from app.models.enums import WorkStatus
from app.schemas.community import CreatorOut, NoticeOut, PolicyOut

router = APIRouter(tags=["info"])

# 동의 문서 (MVP: 코드 상수. 운영에서는 버전별로 DB 관리 + 동의 이력 저장)
POLICIES: dict[str, dict] = {
    "terms": {
        "title": "서비스 이용약관", "version": "2026-11-19", "required_for": ["SIGNUP"],
        "body": "DIBS 콘텐츠·펀딩 서비스 이용 조건. 콘텐츠용 씨앗은 투자용 예치금으로 바꿀 수 없습니다.",
    },
    "privacy": {
        "title": "개인정보 처리방침", "version": "2026-11-19", "required_for": ["SIGNUP"],
        "body": "본인확인 결과(CI)만 보관하고 주민등록번호는 저장하지 않습니다. 배송지는 리워드 배송 목적에만 씁니다.",
    },
    "investment-risk": {
        "title": "투자 위험 고지", "version": "2026-11-19", "required_for": ["SUBSCRIBE", "ORDER"],
        "body": ("원금 손실이 날 수 있고 예금자 보호 대상이 아닙니다. 펀딩 성공이나 찜 수가 투자 수익을 보장하지 않습니다. "
                 "거래량이 적어 원하는 때 팔지 못할 수 있습니다."),
    },
    "termination-rule": {
        "title": "시즌 기간·종료 규칙 고지", "version": "2026-11-19", "required_for": ["SUBSCRIBE"],
        "body": ("이 상품은 한 시즌 연재와 완결 후 12개월 동안만 수익을 나눠 받고, 그 뒤 권리가 소멸합니다. "
                 "원금은 상환되지 않으며 수익은 분기 분배금으로만 얻습니다. "
                 "분배금은 원금 회수 전 순매출의 45%, 원천징수 후 누적 분배금이 발행액에 닿은 다음 분기부터 35%입니다. "
                 "분기 순매출이 발행액의 0.5% 미만으로 2분기 연속이면 더 일찍 종료됩니다. "
                 "작가 매입 옵션은 펀딩마다 선택 사항이며, 선택한 펀딩만 '최근 4분기 보유자 분배금 합계 × 3'으로 전량 매입할 수 있습니다. "
                 "유료 팬이 예상의 40%에 그치면 원금의 약 30%를 잃을 수 있습니다. 위험등급: 매우 높은 위험."),
    },
    "community": {
        "title": "커뮤니티 운영 정책", "version": "2026-11-19", "required_for": ["POST"],
        "body": ("투자자에게는 작품 내용·연재 방식에 개입할 권한이 없습니다. 작가에 대한 압박·악성 댓글은 신고 대상이며 "
                 "신고 3건이 쌓이면 자동으로 숨겨집니다. 주주 게시판은 해당 작품 조각 보유자만 이용합니다."),
    },
}


@router.get("/creators/{user_id}", response_model=CreatorOut, summary="작가 프로필 (공개 작품 포함)")
def creator(user_id: int, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    works = list(db.scalars(select(Work).where(Work.creator_id == user_id, Work.status == WorkStatus.PUBLISHED)
                            .order_by(Work.id.desc()))) if u else []
    if u is None or not works and u.role.value != "CREATOR":
        raise NotFound("CREATOR_NOT_FOUND", "작가를 찾을 수 없어요")
    return CreatorOut(id=u.id, nickname=u.nickname, bio=u.bio, avatar_url=u.avatar_url, works=to_cards(db, works))


@router.get("/notices", response_model=list[NoticeOut], summary="공지사항·종목 공시")
def notices(category: str | None = None, funding_id: int | None = None,
            limit: int = Query(default=20, le=100), offset: int = 0, db: Session = Depends(get_db)):
    stmt = select(Notice)
    if category:
        stmt = stmt.where(Notice.category == category)
    if funding_id:
        stmt = stmt.where(Notice.funding_id == funding_id)
    return list(db.scalars(stmt.order_by(Notice.is_pinned.desc(), Notice.id.desc()).limit(limit).offset(offset)))


@router.get("/notices/{notice_id}", response_model=NoticeOut, summary="공지 상세")
def notice(notice_id: int, db: Session = Depends(get_db)):
    n = db.get(Notice, notice_id)
    if n is None:
        raise NotFound("NOTICE_NOT_FOUND", "공지를 찾을 수 없어요")
    return n


@router.get("/policies", response_model=list[PolicyOut], summary="약관·고지 문서 목록")
def policies():
    return [PolicyOut(key=k, **v) for k, v in POLICIES.items()]


@router.get("/policies/{key}", response_model=PolicyOut, summary="약관 상세")
def policy(key: str):
    if key not in POLICIES:
        raise NotFound("POLICY_NOT_FOUND", "문서를 찾을 수 없어요")
    return PolicyOut(key=key, **POLICIES[key])
