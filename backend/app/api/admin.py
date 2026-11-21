from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.db import get_db
from app.core.errors import Conflict, NotFound
from app.core.security import admin_only
from app.models import (
    Account,
    ContentEvent,
    Notice,
    Post,
    PostReport,
    Episode,
    Funding,
    PayoutSchedule,
    Posting,
    RevenueRecord,
    Subscription,
    User,
    WithdrawalRequest,
    Work,
)
from app.models.enums import EventType, FundingStatus, WorkStatus
from app.schemas.content import EpisodeOut, EpisodePricingIn, ReviewIn, ReviewMetricsOut, WorkAdminOut, WorkOut
from app.schemas.community import NoticeIn, NoticeOut
from app.schemas.funding import (
    CloseOut,
    ClawbackIn,
    DiscontinueIn,
    DiscontinueOut,
    HiatusIn,
    FundingDetailOut,
    FundingOut,
    FundingReviewIn,
    IssuanceAdvanceIn,
    IssuanceOut,
    IssuanceRequestIn,
    PayoutOut,
    ReasonIn,
    SubscriptionOut,
    SuspendIn,
)
from app.schemas.market import DividendRunOut, PeriodIn, RevenueIn, RevenueOut
from app.schemas.wallet import WithdrawalOut
from app.services import content as content_svc
from app.services import dividend as div_svc
from app.services import funding as svc
from app.services import coins, product, reminders, serial
from app.services import wallet as wallet_svc
from app.services.market.mock_exchange import get_market

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(admin_only)])


# ── 작품 심사 ──
def _admin_work(w: Work) -> WorkAdminOut:
    return WorkAdminOut(**WorkOut.model_validate(w).model_dump(), rights_declared=w.rights_declared,
                        prior_contract_note=w.prior_contract_note, review_note=w.review_note,
                        episode_count=len(w.episodes))


@router.get("/works", response_model=list[WorkAdminOut], summary="작품 목록 (상태별, 권리 확인 정보 포함)")
def works(status: WorkStatus = WorkStatus.IN_REVIEW, db: Session = Depends(get_db)):
    return [_admin_work(w) for w in db.scalars(select(Work).where(Work.status == status).order_by(Work.id))]


@router.get("/works/{work_id}", response_model=WorkAdminOut, summary="작품 심사 상세")
def work_detail(work_id: int, db: Session = Depends(get_db)):
    w = db.get(Work, work_id)
    if w is None:
        raise NotFound("WORK_NOT_FOUND", "작품을 찾을 수 없어요")
    return _admin_work(w)


@router.post("/works/{work_id}/review", response_model=WorkOut, summary="작품 공개 심사 (권리 확인)")
def review_work(work_id: int, body: ReviewIn, db: Session = Depends(get_db)):
    w = db.get(Work, work_id)
    if w is None:
        raise NotFound("WORK_NOT_FOUND", "작품을 찾을 수 없어요")
    if w.status != WorkStatus.IN_REVIEW:
        raise Conflict("INVALID_WORK_STATUS", "심사 대기 상태가 아니에요")
    w.status, w.review_note = (WorkStatus.PUBLISHED if body.approve else WorkStatus.REJECTED), body.note
    return w


@router.post("/works/{work_id}/hide", response_model=WorkOut, summary="비공개 처리 (권리 분쟁 등)")
def hide_work(work_id: int, body: ReasonIn, db: Session = Depends(get_db)):
    w = db.get(Work, work_id)
    if w is None:
        raise NotFound("WORK_NOT_FOUND", "작품을 찾을 수 없어요")
    w.status, w.review_note = WorkStatus.HIDDEN, body.reason
    return w


@router.get("/works/{work_id}/review-metrics", response_model=ReviewMetricsOut,
            summary="펀딩 심사 지표 (본인인증 계정만, 조작 의심 신호)")
def review_metrics(work_id: int, db: Session = Depends(get_db)):
    w = db.get(Work, work_id)
    if w is None:
        raise NotFound("WORK_NOT_FOUND", "작품을 찾을 수 없어요")
    return content_svc.review_metrics(db, w)


@router.get("/works/{work_id}/pre-issuance-settlement", summary="발행 전 유료 미리보기 정산 (작가 70 / DIBS 30)")
def pre_issuance_settlement(work_id: int, since: datetime, until: datetime, db: Session = Depends(get_db)):
    w = db.get(Work, work_id)
    if w is None:
        raise NotFound("WORK_NOT_FOUND", "작품을 찾을 수 없어요")
    return content_svc.pre_issuance_settlement(db, w, since, until)


@router.patch("/episodes/{episode_id}/pricing", response_model=EpisodeOut,
              summary="유료 미리보기 지정 (4화부터, 기본 300원, 공개 21일 후 무료)")
def pricing(episode_id: int, body: EpisodePricingIn, db: Session = Depends(get_db)):
    e = db.get(Episode, episode_id)
    if e is None:
        raise NotFound("EPISODE_NOT_FOUND", "회차를 찾을 수 없어요")
    return content_svc.set_episode_pricing(db, e, body.is_paid, body.price_coin, body.free_unlock_at)


# ── 펀딩 심사·운영 ──
@router.get("/fundings", response_model=list[FundingOut], summary="펀딩 목록 (전체 상태)")
def fundings(status: FundingStatus | None = None, db: Session = Depends(get_db)):
    stmt = select(Funding).order_by(Funding.id.desc())
    if status:
        stmt = stmt.where(Funding.status == status)
    return list(db.scalars(stmt))


@router.get("/fundings/{funding_id}", response_model=FundingDetailOut, summary="펀딩 상세 (모든 상태)")
def funding_detail(funding_id: int, db: Session = Depends(get_db)):
    from app.api.fundings import detail

    return detail(db, svc.get_funding(db, funding_id))


@router.post("/fundings/{funding_id}/review", response_model=FundingDetailOut, summary="펀딩 심사·발행 조건 확정")
def review(funding_id: int, body: FundingReviewIn, db: Session = Depends(get_db)):
    from app.api.fundings import detail

    f = svc.get_funding(db, funding_id)
    sched = [p.model_dump() for p in body.payout_schedule] if body.payout_schedule else None
    svc.review_funding(db, f, body.approve, body.terms, body.note, sched)
    return detail(db, f)


@router.post("/fundings/{funding_id}/open", response_model=FundingOut, summary="모집 시작 (찜한 회원에게 알림)")
def open_(funding_id: int, db: Session = Depends(get_db)):
    return svc.open_funding(db, svc.get_funding(db, funding_id))


@router.post("/fundings/{funding_id}/close", response_model=CloseOut, summary="마감 처리 (실패 환불 또는 안분 배정)")
def close(funding_id: int, force: bool = Query(default=False, description="마감 시각 전 강제 마감 (시연용)"),
          db: Session = Depends(get_db)):
    r = svc.close_funding(db, svc.get_funding(db, funding_id), force)
    return CloseOut(status=r.status, requested_units=r.requested_units, target_units=r.target_units,
                    allocations=r.allocations)


@router.get("/fundings/{funding_id}/subscriptions", response_model=list[SubscriptionOut], summary="청약·배정표")
def allocations(funding_id: int, db: Session = Depends(get_db)):
    return list(db.scalars(select(Subscription).where(Subscription.funding_id == funding_id)
                           .order_by(Subscription.first_subscribed_at, Subscription.id)))


@router.post("/fundings/{funding_id}/issuance", response_model=IssuanceOut, status_code=201, summary="발행 요청")
def request_issuance(funding_id: int, body: IssuanceRequestIn, db: Session = Depends(get_db)):
    return svc.request_issuance(db, svc.get_funding(db, funding_id), body.broker_name)


@router.get("/fundings/{funding_id}/issuance", response_model=IssuanceOut, summary="발행 진행 현황")
def get_issuance(funding_id: int, db: Session = Depends(get_db)):
    return svc.get_issuance(db, svc.get_funding(db, funding_id))


@router.post("/fundings/{funding_id}/issuance/advance", response_model=IssuanceOut,
             summary="발행 단계 진행 (LISTED 시 보유 증권 반영·작가 지급)")
def advance(funding_id: int, body: IssuanceAdvanceIn, db: Session = Depends(get_db)):
    return svc.advance_issuance(db, svc.get_funding(db, funding_id), body.step, body.security_code, body.trustee,
                                body.listing_date, body.note)


@router.post("/fundings/{funding_id}/issuance/fail", response_model=FundingOut, summary="발행 실패 (전액 환불·리워드 취소)")
def fail(funding_id: int, body: ReasonIn, db: Session = Depends(get_db)):
    return svc.fail_issuance(db, svc.get_funding(db, funding_id), body.reason)


@router.post("/fundings/{funding_id}/suspension", response_model=FundingOut, summary="거래 정지 / 해제")
def suspension(funding_id: int, body: SuspendIn, db: Session = Depends(get_db)):
    f = svc.get_funding(db, funding_id)
    svc.set_suspended(db, f, body.suspended, body.reason)
    if body.suspended:
        get_market(db).cancel_all(f)
    return f


@router.post("/fundings/{funding_id}/discontinue", response_model=DiscontinueOut,
             summary="연재 중단 확정 (불가피한 사유 / 작가 귀책: 남은 지급분·유보금 보유자 분배, 반환 청구, 거래 정지)")
def discontinue(funding_id: int, body: DiscontinueIn, db: Session = Depends(get_db)):
    f = svc.get_funding(db, funding_id)
    out = svc.discontinue(db, f, body.reason, body.kind)
    get_market(db).cancel_all(f)
    return out


@router.post("/fundings/{funding_id}/complete",
             summary="시즌 완결 확정 (약정 회차 전이면 조기 완결: 남은 작가 지급분 비율 감액, 나머지 보유자 분배)")
def complete(funding_id: int, db: Session = Depends(get_db)):
    return serial.complete_season(db, svc.get_funding(db, funding_id))


@router.post("/fundings/{funding_id}/hiatus", summary="휴재 공지 기록 (시즌 누적 8주까지 연재 기한에서 뺌)")
def hiatus(funding_id: int, body: HiatusIn, db: Session = Depends(get_db)):
    return serial.record_hiatus(db, svc.get_funding(db, funding_id), body.weeks, body.reason)


@router.post("/fundings/{funding_id}/serial-check", summary="연재 지연 판정 (한 달치 경고, 석 달치 귀책 중단)")
def serial_check(funding_id: int, db: Session = Depends(get_db)):
    f = svc.get_funding(db, funding_id)
    out = serial.check_delay(db, f)
    if out["action"] == "DISCONTINUED":
        get_market(db).cancel_all(f)
    return out


@router.post("/fundings/{funding_id}/clawback", summary="귀책 중단 반환금 수납 → 보유자 분배")
def clawback(funding_id: int, body: ClawbackIn, db: Session = Depends(get_db)):
    return serial.collect_clawback(db, svc.get_funding(db, funding_id), body.amount)


@router.post("/jobs/deadline-reminders", summary="매일: 청약 마감 임박 알림 (청약자·찜한 회원)")
def deadline_reminders(db: Session = Depends(get_db)):
    return reminders.deadline_reminders(db)


@router.post("/jobs/expire-coins", summary="매일: 유효기간이 지난 씨앗 만료 (보너스 90일 · 유료 5년)")
def expire_coins(db: Session = Depends(get_db)):
    return coins.expire_bonus(db)


@router.post("/coin/lots/{lot_id}/iap-refund",
             summary="인앱 환불 반영 (스토어 환불 알림 대체). 묶음 회수, 모자라면 다음 충전 때 상계")
def iap_refund(lot_id: int, db: Session = Depends(get_db)):
    return coins.iap_refund(db, lot_id)


@router.post("/jobs/serial-check", summary="매일: 상장 작품 연재 지연 판정")
def serial_check_all(db: Session = Depends(get_db)):
    return serial.check_all(db)


@router.post("/fundings/{funding_id}/terminate", response_model=FundingOut,
             summary="권리 종료 (완결 후 12개월 또는 저매출 2분기 연속, 원금 상환 없음)")
def terminate(funding_id: int, force: bool = Query(default=False, description="조건 충족 전 처리 (시연용)"),
              db: Session = Depends(get_db)):
    f = svc.get_funding(db, funding_id)
    product.terminate(db, f, force)
    get_market(db).cancel_all(f)
    return f


@router.get("/fundings/{funding_id}/payouts", response_model=list[PayoutOut], summary="작가 지급 일정")
def payouts(funding_id: int, db: Session = Depends(get_db)):
    return list(db.scalars(select(PayoutSchedule).where(PayoutSchedule.funding_id == funding_id)
                           .order_by(PayoutSchedule.seq)))


@router.post("/fundings/{funding_id}/payouts/{seq}/pay", response_model=PayoutOut, summary="마일스톤 지급 실행")
def pay_payout(funding_id: int, seq: int, db: Session = Depends(get_db)):
    return svc.pay_milestone(db, svc.get_funding(db, funding_id), seq)


# ── 매출·배당 ──
@router.post("/revenues", response_model=RevenueOut, status_code=201, summary="매출 입력 (광고·굿즈 등)")
def add_revenue(body: RevenueIn, db: Session = Depends(get_db)):
    f = svc.get_funding(db, body.funding_id)
    return div_svc.add_revenue(db, f, body.period, body.source, body.gross, body.deductions, body.note, body.evidence_url)


@router.post("/fundings/{funding_id}/revenues/aggregate", response_model=RevenueOut,
             summary="유료 회차 씨앗 매출 자동 집계")
def aggregate(funding_id: int, body: PeriodIn, db: Session = Depends(get_db)):
    return div_svc.aggregate_paid_episode_revenue(db, svc.get_funding(db, funding_id), body.period)


@router.get("/fundings/{funding_id}/revenues", response_model=list[RevenueOut], summary="매출 내역")
def revenues(funding_id: int, period: str | None = None, db: Session = Depends(get_db)):
    stmt = select(RevenueRecord).where(RevenueRecord.funding_id == funding_id)
    if period:
        stmt = stmt.where(RevenueRecord.period == period)
    return list(db.scalars(stmt.order_by(RevenueRecord.id)))


@router.post("/fundings/{funding_id}/dividends", response_model=DividendRunOut, status_code=201,
             summary="분기 배당 계산 (기준일 보유 수량 스냅샷)")
def calc_dividend(funding_id: int, body: PeriodIn,
                  force: bool = Query(default=False, description="분기 종료 전 계산 (시연용)"),
                  db: Session = Depends(get_db)):
    return div_svc.calculate(db, svc.get_funding(db, funding_id), body.period, force)


@router.post("/dividends/{run_id}/pay", response_model=DividendRunOut, summary="배당 지급 (원천징수 후 예치금 입금)")
def pay_dividend(run_id: int, force: bool = Query(default=False, description="지급일 전 강제 지급 (시연용)"),
                 db: Session = Depends(get_db)):
    return div_svc.pay(db, run_id, force)


# ── 커뮤니티·공지 ──
class ReportedPost(BaseModel):
    post_id: int
    work_id: int
    body: str
    report_count: int
    reasons: list[str]
    is_hidden: bool


@router.get("/reports", response_model=list[ReportedPost], summary="신고된 글")
def reports(db: Session = Depends(get_db)):
    rows = db.execute(select(Post, func.count(PostReport.id)).join(PostReport, PostReport.post_id == Post.id)
                      .group_by(Post.id).order_by(func.count(PostReport.id).desc())).all()
    out = []
    for p, n in rows:
        reasons = sorted(set(db.scalars(select(PostReport.reason).where(PostReport.post_id == p.id))))
        out.append(ReportedPost(post_id=p.id, work_id=p.work_id, body=p.body, report_count=n, reasons=reasons,
                                is_hidden=p.is_hidden))
    return out


class HideIn(BaseModel):
    hidden: bool


@router.post("/posts/{post_id}/visibility", response_model=ReportedPost, summary="글 숨김·복구")
def visibility(post_id: int, body: HideIn, db: Session = Depends(get_db)):
    p = db.get(Post, post_id)
    if p is None:
        raise NotFound("POST_NOT_FOUND", "글을 찾을 수 없어요")
    p.is_hidden = body.hidden
    n = db.scalar(select(func.count()).where(PostReport.post_id == p.id))
    reasons = sorted(set(db.scalars(select(PostReport.reason).where(PostReport.post_id == p.id))))
    return ReportedPost(post_id=p.id, work_id=p.work_id, body=p.body, report_count=n, reasons=reasons,
                        is_hidden=p.is_hidden)


@router.post("/notices", response_model=NoticeOut, status_code=201, summary="공지·종목 공시 등록")
def create_notice(body: NoticeIn, db: Session = Depends(get_db)):
    n = Notice(**body.model_dump())
    db.add(n)
    db.flush()
    return n


# ── 입출금 ──
@router.get("/withdrawals", response_model=list[WithdrawalOut], summary="출금 요청 목록")
def withdrawals(status: str = "PENDING", db: Session = Depends(get_db)):
    return list(db.scalars(select(WithdrawalRequest).where(WithdrawalRequest.status == status)
                           .order_by(WithdrawalRequest.id)))


@router.post("/withdrawals/{req_id}/decision", response_model=WithdrawalOut, summary="출금 승인·거절")
def decide(req_id: int, body: ReviewIn, db: Session = Depends(get_db)):
    return wallet_svc.decide_withdrawal(db, req_id, body.approve)


# ── 배치 작업 (운영에서는 스케줄러가 호출) ──
class JobOut(BaseModel):
    affected: int


@router.post("/jobs/expire-orders", response_model=JobOut, summary="자정: 전일 미체결 주문 자동 취소")
def expire_orders(db: Session = Depends(get_db)):
    return JobOut(affected=get_market(db).expire_orders(clock.now().date()))


@router.post("/jobs/roll-reference-prices", response_model=JobOut, summary="04:00 점검: 기준가 = 직전 체결가")
def roll(db: Session = Depends(get_db)):
    return JobOut(affected=get_market(db).roll_reference_prices())


# ── 데이터·점검 ──
class EventExportItem(BaseModel):
    id: int
    user_id: int | None
    anon_id: str | None
    session_id: str | None
    event_type: EventType
    work_id: int | None
    episode_id: int | None
    short_id: int | None
    funding_id: int | None
    progress: float | None
    occurred_at: datetime
    props: dict

    model_config = {"from_attributes": True}


@router.get("/events/export", response_model=list[EventExportItem], summary="이벤트 원천 데이터 추출 (데이터 분석용)")
def export_events(since_id: int = 0, limit: int = Query(default=1000, le=10000), db: Session = Depends(get_db)):
    """since_id 커서로 증분 추출. 운영에서는 개인정보 가명처리 후 분석 환경으로 적재."""
    return list(db.scalars(select(ContentEvent).where(ContentEvent.id > since_id).order_by(ContentEvent.id).limit(limit)))


class TrialBalanceLine(BaseModel):
    kind: str
    mode: str
    balance: int


@router.get("/ledger/trial-balance", response_model=list[TrialBalanceLine], summary="시산표 (계정 종류별 합계, 총합 0)")
def trial_balance(db: Session = Depends(get_db)):
    rows = db.execute(select(Account.kind, Account.mode, func.sum(Posting.amount))
                      .join(Posting, Posting.account_id == Account.id).group_by(Account.kind, Account.mode)).all()
    return [TrialBalanceLine(kind=k, mode=m, balance=int(b)) for k, m, b in rows]


__all__ = ["router", "User"]
