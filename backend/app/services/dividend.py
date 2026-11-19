"""저작권료 분기 배당.

재원 (v3.0)
  - 나눠지는 재원: 상장 작품의 DIBS 안 순매출 (유료 회차·광고·굿즈) → DIBS / 작가 / 주주 = 30/30/40
  - 전액 주주 재원: 외부 연재 수익 중 작가 몫 × 20% (선공개 독점 종료 후), 거래 수수료 적립분
  - 영상화·게임 등 2차 IP 수익은 제외
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
from app.models.enums import HOLDER_ONLY_SOURCES, AccountKind, DividendStatus, FundingStatus, RevenueSource
from app.services import ledger
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
    if f.status not in (FundingStatus.LISTED, FundingStatus.SUSPENDED, FundingStatus.MATURED):
        raise Conflict("NOT_LISTED", "상장된 종목만 배당할 수 있어요")


def add_revenue(db: Session, f: Funding, period: str, source: RevenueSource, gross: int, deductions: int,
                note: str | None = None, evidence_url: str | None = None) -> RevenueRecord:
    _listed(f)
    parse_period(period)
    if gross < 0 or deductions < 0 or deductions > gross:
        raise DomainError("INVALID_REVENUE", "매출과 공제액을 확인해 주세요")
    if source == RevenueSource.EXTERNAL_SERIAL:
        # gross = 외부 플랫폼 정산서상 작가 몫. 그중 external_share_bps 만 배당 재원
        _, end = parse_period(period)
        if not f.exclusive_until or end < f.exclusive_until.date():
            raise Conflict("EXCLUSIVE_PERIOD", "선공개 독점 기간에는 외부 연재 수익을 넣을 수 없어요")
        if not evidence_url:
            raise DomainError("EVIDENCE_REQUIRED", "외부 플랫폼 정산서(증빙)를 첨부해 주세요")
        deductions = gross - gross * f.external_share_bps // 10000
    if source == RevenueSource.FEE_RESERVE:
        raise DomainError("SYSTEM_SOURCE", "거래 수수료 적립분은 배당 계산 때 자동으로 집계돼요")
    if db.scalar(select(DividendRun.id).where(DividendRun.funding_id == f.id, DividendRun.period == period)):
        raise Conflict("PERIOD_CLOSED", "이미 배당을 계산한 분기예요")
    r = RevenueRecord(funding_id=f.id, period=period, source=source, gross=gross, deductions=deductions,
                      net=gross - deductions, note=note, evidence_url=evidence_url)
    db.add(r)
    db.flush()
    return r


def aggregate_paid_episode_revenue(db: Session, f: Funding, period: str) -> RevenueRecord:
    """유료 회차 코인 매출을 집계해 PAID_EPISODE 매출로 기록 (같은 분기 재집계 시 교체)."""
    _listed(f)
    start, end = parse_period(period)
    since = max(datetime.combine(start, time.min), f.listed_at)
    gross = int(db.scalar(select(func.coalesce(func.sum(EpisodeUnlock.price_coin), 0)).where(
        EpisodeUnlock.work_id == f.work_id, EpisodeUnlock.unlocked_at >= since,
        EpisodeUnlock.unlocked_at < datetime.combine(end + timedelta(days=1), time.min))))
    for old in db.scalars(select(RevenueRecord).where(RevenueRecord.funding_id == f.id, RevenueRecord.period == period,
                                                      RevenueRecord.source == RevenueSource.PAID_EPISODE)):
        db.delete(old)
    db.flush()
    return add_revenue(db, f, period, RevenueSource.PAID_EPISODE, gross, gross * settings.inapp_fee_bps // 10000,
                       note="유료 회차 코인 매출 자동 집계 (인앱결제 수수료 공제)")


def aggregate_fee_reserve(db: Session, f: Funding, period: str) -> RevenueRecord | None:
    """해당 분기 체결에서 적립된 거래 수수료 배당 재원을 FEE_RESERVE 매출로 기록 (재집계 시 교체)."""
    start, end = parse_period(period)
    amount = int(db.scalar(select(func.coalesce(func.sum(Trade.fee_reserve), 0)).where(
        Trade.funding_id == f.id, Trade.mode == f.mode, Trade.created_at >= datetime.combine(start, time.min),
        Trade.created_at < datetime.combine(end + timedelta(days=1), time.min))))
    for old in db.scalars(select(RevenueRecord).where(RevenueRecord.funding_id == f.id, RevenueRecord.period == period,
                                                      RevenueRecord.source == RevenueSource.FEE_RESERVE)):
        db.delete(old)
    db.flush()
    if amount == 0:
        return None
    r = RevenueRecord(funding_id=f.id, period=period, source=RevenueSource.FEE_RESERVE, gross=amount, deductions=0,
                      net=amount, note="거래 수수료 적립분 자동 집계 (전액 주주 몫)")
    db.add(r)
    db.flush()
    return r


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

    aggregate_fee_reserve(db, f, period)
    records = list(db.scalars(select(RevenueRecord).where(RevenueRecord.funding_id == f.id,
                                                          RevenueRecord.period == period)))
    net = sum(r.net for r in records if r.source not in HOLDER_ONLY_SOURCES)  # 30/30/40 으로 나눌 재원
    direct = sum(r.net for r in records if r.source in HOLDER_ONLY_SOURCES)  # 전액 주주 재원
    holder_split = net * f.royalty_holder_bps // 10000
    creator_amount = net * f.royalty_creator_bps // 10000
    platform_amount = net - holder_split - creator_amount
    holder_pool = holder_split + direct

    snapshot = holdings_at(db, f, cutoff)
    total_units = sum(snapshot.values())
    if total_units == 0:
        raise Conflict("NO_HOLDERS", "기준일 보유자가 없어요")

    run = DividendRun(funding_id=f.id, period=period, record_date=record_date, pay_date=default_pay_date(record_date),
                      net_revenue=net, holder_direct=direct, holder_pool=holder_pool, creator_amount=creator_amount,
                      platform_amount=platform_amount, total_units=total_units,
                      per_unit_gross=round(holder_pool / total_units, 2))
    db.add(run)
    db.flush()
    paid = 0
    for user_id, units in sorted(snapshot.items()):
        gross = holder_pool * units // total_units
        tax = gross * settings.dividend_tax_bps // 10000
        paid += gross
        db.add(DividendPayment(run_id=run.id, user_id=user_id, units=units, gross=gross, tax=tax, net=gross - tax))
    run.residual = holder_pool - paid
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
    if run.net_revenue == 0 and run.holder_direct == 0:
        run.status = DividendStatus.PAID
        return run

    fee_part = int(db.scalar(select(func.coalesce(func.sum(RevenueRecord.net), 0)).where(
        RevenueRecord.funding_id == f.id, RevenueRecord.period == run.period,
        RevenueRecord.source == RevenueSource.FEE_RESERVE)))
    legs = [Leg(ledger.sys(db, AccountKind.SYS_ROYALTY_POOL, f.mode), -(run.net_revenue + run.holder_direct - fee_part)),
            Leg(ledger.sys(db, AccountKind.SYS_FEE_RESERVE, f.mode), -fee_part),
            Leg(ledger.sys(db, AccountKind.SYS_TAX_WITHHOLDING, f.mode), sum(p.tax for p in payments)),
            Leg(ledger.user_accounts(db, work.creator_id, f.mode).deposit, run.creator_amount),
            Leg(ledger.sys(db, AccountKind.SYS_PLATFORM_REVENUE, f.mode), run.platform_amount + run.residual)]
    legs += [Leg(ledger.user_accounts(db, p.user_id, f.mode).deposit, p.net) for p in payments]
    j = ledger.post(db, "DIVIDEND_PAYOUT", legs, f.mode, "dividend_run", run.id, memo=run.period)
    run.status, run.journal_id = DividendStatus.PAID, j.id
    for p in payments:
        notify(db, p.user_id, "DIVIDEND_PAID", f"「{work.title}」 {run.period} 배당금 {p.net:,}원이 들어왔어요",
               f"세전 {p.gross:,}원 · 원천징수 {p.tax:,}원", "dividend_run", run.id)
    return run
