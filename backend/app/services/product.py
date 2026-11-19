"""v4.0 증권 상품 규칙.

- 1인 청약 한도: 3,000만 원과 발행액 5% 중 작은 금액
- 펀딩 개설 조건: 파일럿 4주 열람자 ≥ '4년 안 원금 회수에 필요한 월 열람자'의 50%
- 목표 금액 상한: 예상 월 투자자 몫(세후) × 48개월
- 회수 우선 배분: 누적 세전 분배금 ≥ 발행액이 된 다음 분기부터 '회수 후' 비율
- 만기 없음. 종료: 완결 후 3년, 또는 분기 순매출 < 발행액 0.5% 가 2분기 연속
- 작가 매입 옵션: 최근 4분기 보유자 분배금 합계 × 3 으로 전량 매입

계산은 모두 정수(원)로 하고, 가정값(결제율·월 회차·유료화 후 남는 비율)은 설정에서 읽는다.
"""
import math
from datetime import timedelta

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import Conflict, DomainError, Forbidden
from app.models import ContentEvent, DividendRun, Funding, Holding, Work
from app.models.enums import EventType, FundingStatus
from app.services import ledger
from app.services.ledger import Leg
from app.services.policy import notify

BPS = 10000


# ───────────────────────────── 청약 한도 ─────────────────────────────

def per_user_cap_amount(target_amount: int) -> int:
    return min(settings.max_subscription_amount, target_amount * settings.max_subscription_bps // BPS)


def per_user_cap_units(f: Funding) -> int:
    cap = max(1, per_user_cap_amount(f.target_amount) // f.unit_price)
    return min(cap, f.max_units_per_user) if f.max_units_per_user else cap


# ───────────────────────────── 수요 → 목표 금액 ─────────────────────────────

def monthly_net_per_reader(price_coin: int | None = None) -> float:
    """월 열람자 1명이 만드는 순매출(원) = 결제율 × 월 회차 × 회당 가격 × (1 − 인앱 수수료)."""
    price = price_coin or settings.default_preview_price_coin
    return (settings.assumed_pay_rate_bps / BPS) * settings.assumed_monthly_episodes * price \
        * (1 - settings.inapp_fee_bps / BPS)


def monthly_investor_take_per_reader(holder_bps: int | None = None) -> float:
    """열람자 1명당 월 투자자 몫(세후)."""
    holder = (holder_bps or settings.royalty_holder_bps) / BPS
    return monthly_net_per_reader() * holder * (1 - settings.dividend_tax_bps / BPS)


def readers_needed(target_amount: int, months: int | None = None) -> int:
    """기준 가정에서 months(기본 48개월) 안에 원금을 회수하는 데 필요한 월 열람자."""
    months = months or settings.recoup_target_months
    return math.ceil(target_amount / (monthly_investor_take_per_reader() * months))


def target_cap(expected_monthly_readers: int) -> int:
    """목표 금액 상한 = 예상 월 투자자 몫(세후) × 48. 100만 원 단위 내림."""
    raw = expected_monthly_readers * monthly_investor_take_per_reader() * settings.recoup_target_months
    return int(raw // 1_000_000 * 1_000_000)


def pilot_readers(db: Session, work_id: int, days: int = 28) -> int:
    """최근 4주 파일럿 열람자 = 회차 열람을 시작한 고유 사용자(로그인·비로그인)."""
    since = clock.now() - timedelta(days=days)
    users = db.scalar(select(func.count(distinct(ContentEvent.user_id))).where(
        ContentEvent.work_id == work_id, ContentEvent.event_type == EventType.VIEW_START,
        ContentEvent.occurred_at >= since, ContentEvent.user_id.is_not(None))) or 0
    anons = db.scalar(select(func.count(distinct(ContentEvent.anon_id))).where(
        ContentEvent.work_id == work_id, ContentEvent.event_type == EventType.VIEW_START,
        ContentEvent.occurred_at >= since, ContentEvent.user_id.is_(None), ContentEvent.anon_id.is_not(None))) or 0
    return int(users + anons)


def funding_gate(db: Session, work_id: int, target_amount: int, growth_factor: float = 1.0) -> dict:
    pilot = pilot_readers(db, work_id)
    need = readers_needed(target_amount)
    threshold = math.ceil(need * settings.gate_ratio_bps / BPS)
    expected = int(pilot * settings.assumed_retention_bps / BPS * growth_factor)
    cap = target_cap(expected)
    return {
        "pilot_readers_4w": pilot,
        "readers_needed_for_4y": need,
        "gate_threshold": threshold,
        "passes_gate": pilot >= threshold,
        "expected_monthly_readers": expected,
        "target_cap": cap,
        "within_cap": target_amount <= cap,
        "enforced": settings.enforce_funding_gate,
    }


def check_funding_gate(db: Session, work_id: int, target_amount: int) -> dict:
    g = funding_gate(db, work_id, target_amount)
    if settings.enforce_funding_gate:
        if not g["passes_gate"]:
            raise Conflict("FUNDING_GATE_NOT_MET",
                           f"파일럿 4주 열람자가 {g['gate_threshold']:,}명 이상이어야 펀딩을 열 수 있어요 "
                           f"(현재 {g['pilot_readers_4w']:,}명)")
        if not g["within_cap"]:
            raise DomainError("TARGET_OVER_CAP", f"목표 금액은 {g['target_cap']:,}원을 넘을 수 없어요")
    return g


# ───────────────────────────── 회수 우선 배분 ─────────────────────────────

def cumulative_holder_gross(db: Session, f: Funding, before_period: str | None = None) -> int:
    q = select(func.coalesce(func.sum(DividendRun.holder_pool), 0)).where(DividendRun.funding_id == f.id)
    if before_period:
        q = q.where(DividendRun.period < before_period)
    return int(db.scalar(q))


def is_recouped_for(f: Funding, period: str) -> bool:
    """회수한 분기의 '다음 분기'부터 회수 후 비율."""
    return bool(f.recouped_period) and period > f.recouped_period


def split_for(f: Funding, period: str) -> tuple[str, int, int, int]:
    """(phase, holder_bps, creator_bps, platform_bps)"""
    if is_recouped_for(f, period):
        return "AFTER_RECOUP", f.royalty_holder_after_bps, f.royalty_creator_after_bps, f.royalty_platform_after_bps
    return "BEFORE_RECOUP", f.royalty_holder_bps, f.royalty_creator_bps, f.royalty_platform_bps


def recoup_status(db: Session, f: Funding) -> dict:
    cum = cumulative_holder_gross(db, f)
    after = bool(f.recouped_period)
    return {
        "phase": "AFTER_RECOUP" if after else "BEFORE_RECOUP",
        "recouped_period": f.recouped_period,
        "cumulative_holder_gross": cum,
        "issuance_amount": f.target_amount,
        "progress_pct": round(min(cum * 100 / f.target_amount, 100), 1) if f.target_amount else 0.0,
        "holder_bps_now": f.royalty_holder_after_bps if after else f.royalty_holder_bps,
        "holder_bps_before": f.royalty_holder_bps,
        "holder_bps_after": f.royalty_holder_after_bps,
    }


# ───────────────────────────── 종료 규칙·작가 매입 ─────────────────────────────

def _recent_runs(db: Session, f: Funding, n: int) -> list[DividendRun]:
    return list(db.scalars(select(DividendRun).where(DividendRun.funding_id == f.id)
                           .order_by(DividendRun.period.desc()).limit(n)))


def buyback_price(db: Session, f: Funding) -> int | None:
    runs = _recent_runs(db, f, 4)
    if not runs:
        return None
    return sum(r.holder_pool for r in runs) * settings.buyback_multiple


def termination_check(db: Session, f: Funding) -> dict:
    from app.services.funding import add_months

    due = add_months(f.completed_at, settings.termination_after_completion_months) if f.completed_at else None
    threshold = f.target_amount * settings.low_revenue_bps // BPS
    streak = 0
    for r in _recent_runs(db, f, settings.low_revenue_quarters):
        if r.net_revenue < threshold:
            streak += 1
        else:
            break
    reason = None
    if due and clock.now() >= due:
        reason = "COMPLETED_3Y"
    elif streak >= settings.low_revenue_quarters:
        reason = "LOW_REVENUE"
    return {"completed_at": f.completed_at, "terminate_due_at": due, "low_revenue_threshold": threshold,
            "low_revenue_streak": streak, "eligible": reason is not None, "reason": reason,
            "buyback_price": buyback_price(db, f)}


def _holders(db: Session, f: Funding) -> list[Holding]:
    return list(db.scalars(select(Holding).where(Holding.funding_id == f.id, Holding.mode == f.mode,
                                                 Holding.units > 0).order_by(Holding.user_id)))


def _require_live(f: Funding) -> None:
    if f.status not in (FundingStatus.LISTED, FundingStatus.SUSPENDED):
        raise Conflict("INVALID_FUNDING_STATUS", f"현재 상태({f.status})에서는 할 수 없어요")


def mark_completed(db: Session, f: Funding) -> Funding:
    _require_live(f)
    if f.completed_at:
        raise Conflict("ALREADY_COMPLETED", "이미 완결 처리된 작품이에요")
    f.completed_at = clock.now()
    return f


def terminate(db: Session, f: Funding, force: bool = False) -> Funding:
    """종료 규칙 충족 시 권리 종료. 원금 상환은 없고, 이미 계산한 분기 배당은 그대로 지급한다."""
    _require_live(f)
    chk = termination_check(db, f)
    if not chk["eligible"] and not force:
        raise Conflict("TERMINATION_NOT_DUE", "종료 조건(완결 후 3년 또는 저매출 2분기 연속)을 충족하지 않았어요")
    work = db.get(Work, f.work_id)
    for h in _holders(db, f):
        notify(db, h.user_id, "TERMINATED", f"「{work.title}」 수익 배분 권리가 종료됐어요",
               "이미 계산된 분기 배당은 예정대로 지급돼요. 원금 상환은 없어요.", "funding", f.id)
    f.status, f.terminated_at, f.termination_reason = FundingStatus.TERMINATED, clock.now(), chk["reason"] or "FORCED"
    return f


def buyback(db: Session, f: Funding, creator_id: int) -> dict:
    """작가 매입 옵션: 매입가를 보유 비율대로 지급하고 권리를 종료한다."""
    _require_live(f)
    work = db.get(Work, f.work_id)
    if work.creator_id != creator_id:
        raise Forbidden("NOT_WORK_OWNER", "작품의 작가만 매입할 수 있어요")
    price = buyback_price(db, f)
    if price is None:
        raise Conflict("NO_DIVIDEND_HISTORY", "배당 이력이 있어야 매입가를 정할 수 있어요")
    holders = _holders(db, f)
    total_units = sum(h.units for h in holders)
    creator_acc = ledger.user_accounts(db, creator_id, f.mode)
    if ledger.balance(db, creator_acc.deposit) < price:
        raise DomainError("INSUFFICIENT_BALANCE", f"매입가 {price:,}원이 예치금보다 많아요")
    legs, paid = [Leg(creator_acc.deposit, -price)], 0
    for h in holders:
        amt = price * h.units // total_units
        paid += amt
        legs.append(Leg(ledger.user_accounts(db, h.user_id, f.mode).deposit, amt))
        notify(db, h.user_id, "BUYBACK", f"「{work.title}」 작가가 조각을 모두 매입했어요",
               f"{h.units}조각 매입 대금 {amt:,}원이 예치금으로 들어왔어요.", "funding", f.id)
        h.units, h.locked_units = 0, 0
    if price - paid:
        legs.append(Leg(creator_acc.deposit, price - paid))  # 절사 잔여는 작가에게 반환
    ledger.post(db, "CREATOR_BUYBACK", legs, f.mode, "funding", f.id)
    f.status, f.terminated_at, f.termination_reason = FundingStatus.TERMINATED, clock.now(), "BUYBACK"
    return {"price": price, "paid": paid, "holders": len(holders)}
