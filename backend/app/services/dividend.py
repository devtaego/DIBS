"""저작권료 분기 배당.

재원 (v4.0): 순매출 = 유료 미리보기·광고·굿즈 − 인앱 수수료 − 굿즈 원가
            + 선공개 독점 12개월 뒤 외부 연재·영상화 수익 중 작가 몫 × 20%
배분 (회수 우선): 회수 전 작가 30 / 투자자 45 / DIBS 25
                → 원천징수 후 누적 분배금 ≥ 발행액이 된 분기의 다음 분기부터 40 / 35 / 25 (모든 보유자 동시)
거래 수수료는 거래소·증권사 몫이라 배당 재원에 넣지 않는다.
주주 몫: 기준일(분기 말일 24:00) 보유 조각 수 비례, 원 단위 절사 → 잔여는 플랫폼 귀속
지급: 다음 달 10일 예치금, 배당소득세 15.4% 원천징수
"""
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import Conflict, DomainError, NotFound
from app.models import DividendPayment, DividendRun, EpisodeUnlock, Funding, Holding, RevenueRecord, Trade, Work
from app.models.enums import AccountKind, DiscontinueKind, DividendStatus, FundingStatus, RevenueSource
from app.services import ledger, product
from app.services.ledger import Leg
from app.services.policy import notify


def parse_period(period: str) -> tuple[date, date]:
    """'2027Q1' → (2027-01-01, 2027-03-31)"""
    try:
        year, q = int(period[:4]), int(period[5])
        assert period[4] == "Q" and 1 <= q <= 4 and len(period) == 6
    except (ValueError, AssertionError, IndexError):
        raise DomainError("INVALID_PERIOD", "기간은 '2027Q1' 형식이에요") from None
    start = date(year, 3 * q - 2, 1)
    end = (date(year + 1, 1, 1) if q == 4 else date(year, 3 * q + 1, 1)) - timedelta(days=1)
    return start, end


def default_pay_date(record_date: date) -> date:
    nxt = date(record_date.year + 1, 1, 1) if record_date.month == 12 else date(record_date.year, record_date.month + 1, 1)
    return nxt.replace(day=settings.dividend_pay_day)


def _listed(f: Funding) -> None:
    if f.status not in (FundingStatus.LISTED, FundingStatus.SUSPENDED, FundingStatus.TERMINATED):
        raise Conflict("NOT_LISTED", "상장된 종목만 배당할 수 있어요")


def add_revenue(db: Session, f: Funding, period: str, source: RevenueSource, gross: int, deductions: int,
                note: str | None = None, evidence_url: str | None = None) -> RevenueRecord:
    _listed(f)
    parse_period(period)
    if gross < 0 or deductions < 0 or deductions > gross:
        raise DomainError("INVALID_REVENUE", "매출과 공제액을 확인해 주세요")
    if source == RevenueSource.EXTERNAL_SERIAL:
        # gross = 외부 플랫폼 정산금. 그중 external_share_bps 만 배당 재원 (v2.3 기본 100%, v5는 작가 몫의 20%)
        _, end = parse_period(period)
        if not f.exclusive_until or end < f.exclusive_until.date():
            raise Conflict("EXCLUSIVE_PERIOD", "선공개 독점 기간에는 외부 연재 수익을 넣을 수 없어요")
        if not evidence_url:
            raise DomainError("EVIDENCE_REQUIRED", "외부 플랫폼 정산서(증빙)를 첨부해 주세요")
        deductions += gross - gross * f.external_share_bps // 10000
        if deductions > gross:
            raise DomainError("INVALID_REVENUE", "공제액이 매출보다 커요")
    if source == RevenueSource.SECONDARY_IP and not evidence_url:
        raise DomainError("EVIDENCE_REQUIRED", "2차·해외 IP 계약서와 정산서(증빙)를 첨부해 주세요")
    if db.scalar(select(DividendRun.id).where(DividendRun.funding_id == f.id, DividendRun.period == period)):
        raise Conflict("PERIOD_CLOSED", "이미 배당을 계산한 분기예요")
    r = RevenueRecord(funding_id=f.id, period=period, source=source, gross=gross, deductions=deductions,
                      net=gross - deductions, note=note, evidence_url=evidence_url)
    db.add(r)
    db.flush()
    return r


def aggregate_paid_episode_revenue(db: Session, f: Funding, period: str) -> RevenueRecord:
    """유료 회차 코인 매출을 집계해 PAID_EPISODE 매출로 기록 (같은 분기 재집계 시 교체).

    결제 시점에 신탁 계좌로 분할된 결제(EpisodeUnlock.funding_id == f.id)만 센다. 정산 기준은 결제액이고
    공제는 인앱결제 수수료뿐이라, 열람 기록을 바꿔도 분배금은 달라지지 않는다.
    """
    _listed(f)
    start, end = parse_period(period)
    since = max(datetime.combine(start, time.min), f.listed_at)
    gross = int(db.scalar(select(func.coalesce(func.sum(EpisodeUnlock.price_coin), 0)).where(
        EpisodeUnlock.funding_id == f.id, EpisodeUnlock.unlocked_at >= since,
        EpisodeUnlock.unlocked_at < datetime.combine(end + timedelta(days=1), time.min))))
    for old in db.scalars(select(RevenueRecord).where(RevenueRecord.funding_id == f.id, RevenueRecord.period == period,
                                                      RevenueRecord.source == RevenueSource.PAID_EPISODE)):
        db.delete(old)
    db.flush()
    return add_revenue(db, f, period, RevenueSource.PAID_EPISODE, gross, gross * settings.inapp_fee_bps // 10000,
                       note="유료 회차 코인 매출 자동 집계 (인앱결제 수수료 공제)")


def holdings_at(db: Session, f: Funding, cutoff: datetime) -> dict[int, int]:
    """기준 시각 보유 수량 = 현재 보유 - 기준 이후 매수 + 기준 이후 매도."""
    units = {h.user_id: h.units for h in db.scalars(select(Holding).where(Holding.funding_id == f.id,
                                                                            Holding.mode == f.mode))}
    for t in db.scalars(select(Trade).where(Trade.funding_id == f.id, Trade.mode == f.mode, Trade.created_at >= cutoff)):
        units[t.buyer_id] = units.get(t.buyer_id, 0) - t.units
        units[t.seller_id] = units.get(t.seller_id, 0) + t.units
    return {u: n for u, n in units.items() if n > 0}


def calculate(db: Session, f: Funding, period: str, force: bool = False) -> DividendRun:
    _listed(f)
    if db.scalar(select(DividendRun.id).where(DividendRun.funding_id == f.id, DividendRun.period == period)):
        raise Conflict("DIVIDEND_EXISTS", "이미 계산한 분기예요")
    _, record_date = parse_period(period)
    cutoff = datetime.combine(record_date + timedelta(days=1), time.min)
    if not force and clock.now() < cutoff:
        raise Conflict("PERIOD_NOT_ENDED", f"{period}이 끝난 뒤({record_date} 이후)에 계산할 수 있어요")
    if f.listed_at >= cutoff:
        raise Conflict("LISTED_AFTER_RECORD_DATE", "기준일 이후 상장된 종목이에요")

    records = list(db.scalars(select(RevenueRecord).where(RevenueRecord.funding_id == f.id,
                                                          RevenueRecord.period == period)))
    net = sum(r.net for r in records)
    phase, holder_bps, creator_bps, _ = product.split_for(f, period)
    holder_pool = net * holder_bps // 10000
    creator_amount = net * creator_bps // 10000
    platform_amount = net - holder_pool - creator_amount
    # 연재 위험 장치: 귀책 중단이면 반환 청구액을 채울 때까지 작가 몫을 투자자에게,
    # 그 밖에는 회수 전 작가 몫의 50%를 유보 (회수·종료 때 작가에게, 귀책 시 투자자에게)
    clawback_applied = creator_escrow = 0
    outstanding = max(0, f.clawback_due - f.clawback_collected)
    if f.discontinue_kind == DiscontinueKind.FAULT:
        clawback_applied = min(creator_amount, outstanding)
        holder_pool += clawback_applied
        creator_amount -= clawback_applied
        f.clawback_collected += clawback_applied
    elif phase == "BEFORE_RECOUP":
        creator_escrow = creator_amount * settings.creator_escrow_bps // 10000
        f.creator_escrow_balance += creator_escrow

    snapshot = holdings_at(db, f, cutoff)
    total_units = sum(snapshot.values())
    if total_units == 0:
        raise Conflict("NO_HOLDERS", "기준일 보유자가 없어요")

    run = DividendRun(funding_id=f.id, period=period, record_date=record_date, pay_date=default_pay_date(record_date),
                      net_revenue=net, phase=phase, holder_pool=holder_pool, creator_amount=creator_amount,
                      platform_amount=platform_amount, total_units=total_units,
                      per_unit_gross=round(holder_pool / total_units, 2), creator_escrow=creator_escrow,
                      clawback_applied=clawback_applied)
    db.add(run)
    db.flush()
    paid = 0
    for user_id, units in sorted(snapshot.items()):
        gross = holder_pool * units // total_units
        tax = gross * settings.dividend_tax_bps // 10000
        paid += gross
        db.add(DividendPayment(run_id=run.id, user_id=user_id, units=units, gross=gross, tax=tax, net=gross - tax))
    run.residual = holder_pool - paid
    # 회수 판정: 이번 분기까지 원천징수 후 누적 분배금이 발행액에 닿으면 다음 분기부터 회수 후 비율
    cum_gross = product.cumulative_holder_gross(db, f, period) + holder_pool
    if not f.recouped_period and product.after_tax(cum_gross) >= f.target_amount:
        f.recouped_period = period
        run.recouped_now = True
        if f.discontinue_kind != DiscontinueKind.FAULT:  # 회수 달성: 유보금을 이번 지급 때 작가에게 푼다
            run.escrow_released = f.creator_escrow_balance
            f.creator_escrow_balance = 0
    db.flush()
    return run


def pay(db: Session, run_id: int, force: bool = False) -> DividendRun:
    run = db.get(DividendRun, run_id)
    if run is None:
        raise NotFound("DIVIDEND_NOT_FOUND", "배당 내역을 찾을 수 없어요")
    if run.status != DividendStatus.CALCULATED:
        raise Conflict("DIVIDEND_PAID", "이미 지급한 배당이에요")
    if not force and clock.now().date() < run.pay_date:
        raise Conflict("BEFORE_PAY_DATE", f"지급일({run.pay_date}) 전이에요")
    f = db.get(Funding, run.funding_id)
    work = db.get(Work, f.work_id)
    payments = list(db.scalars(select(DividendPayment).where(DividendPayment.run_id == run.id)))
    if run.net_revenue == 0:
        run.status = DividendStatus.PAID
        return run

    legs = [Leg(ledger.sys(db, AccountKind.SYS_ROYALTY_POOL, f.mode), -run.net_revenue),
            Leg(ledger.sys(db, AccountKind.SYS_TAX_WITHHOLDING, f.mode), sum(p.tax for p in payments)),
            Leg(ledger.user_accounts(db, work.creator_id, f.mode).deposit,
                run.creator_amount - run.creator_escrow + run.escrow_released),
            Leg(ledger.sys(db, AccountKind.SYS_CREATOR_ESCROW, f.mode), run.creator_escrow - run.escrow_released),
            Leg(ledger.sys(db, AccountKind.SYS_PLATFORM_REVENUE, f.mode), run.platform_amount + run.residual)]
    legs += [Leg(ledger.user_accounts(db, p.user_id, f.mode).deposit, p.net) for p in payments]
    j = ledger.post(db, "DIVIDEND_PAYOUT", legs, f.mode, "dividend_run", run.id, memo=run.period)
    run.status, run.journal_id = DividendStatus.PAID, j.id
    for p in payments:
        notify(db, p.user_id, "DIVIDEND_PAID", f"「{work.title}」 {run.period} 배당금 {p.net:,}원이 들어왔어요",
               f"세전 {p.gross:,}원 · 원천징수 {p.tax:,}원", "dividend_run", run.id)
    return run
