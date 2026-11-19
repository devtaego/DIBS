"""v5.0 증권 상품 규칙 (시즌 단위).

- 1인 청약 한도: 3,000만 원과 발행액 5% 중 작은 금액 (1,000만 원 발행이면 1인 최대 50만 원)
- 상품 기간: 시즌 연재(약 12개월) + 완결 후 12개월. 이후 권리 소멸 (원금 상환 없음)
- 목표 금액 상한: 예상 유료 팬 × 유료 팬 1명당 상품 기간 전체 투자자 몫(세후) × 70%
- 펀딩 개설 조건: 파일럿 4주 유료 구매자 ≥ 목표 금액에 필요한 유료 팬 (열람자 수가 아니라 실제 결제로 판단)
- 회수 우선 배분: 원천징수 후 누적 분배금 ≥ 발행액이 된 다음 분기부터 '회수 후' 비율
- 종료: 완결 후 12개월, 또는 분기 순매출 < 발행액 0.5% 가 2분기 연속. 작가 매입은 펀딩별 선택 사항

계산은 정수(원)로 하고, 가정값(월 구매 회차·완결 후 매출 곡선)은 설정에서 읽는다.
"""
import math
from datetime import timedelta

from sqlalchemy import String, cast, distinct, func, literal, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import Conflict, DomainError, Forbidden
from app.models import ContentEvent, DividendRun, EpisodeUnlock, Funding, Holding, Work
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


# ───────────────────────────── 시즌 매출 곡선 ─────────────────────────────

def season_curve() -> list[float]:
    """상품 기간의 월별 매출 수준 (연재 중 = 1.0). 완결 후에는 40%에서 시작해 1년에 30%씩 줄어든다."""
    tail = [settings.tail_level_bps / BPS * (1 - settings.tail_decay_bps_per_year / BPS) ** (m / 12)
            for m in range(settings.tail_months)]
    return [1.0] * settings.season_months + tail


def term_months() -> int:
    return settings.season_months + settings.tail_months


def monthly_net_per_paying_fan(price_coin: int | None = None) -> float:
    """유료 팬 1명이 연재 중 한 달에 만드는 순매출(원) = 월 구매 회차 × 회당 가격 × (1 − 인앱 수수료)."""
    price = price_coin or settings.default_preview_price_coin
    return settings.assumed_monthly_episodes * price * (1 - settings.inapp_fee_bps / BPS)


def simulate(target_amount: int, paying_fans: float, holder_bps: int | None = None,
             holder_after_bps: int | None = None) -> dict:
    """상품 기간 동안 투자자에게 돌아오는 세후 분배금 (분기 말 회수 판정, 다음 분기부터 회수 후 비율).

    반환: 월별 세후 분배금, 원금 회수 달(없으면 None), 총회수 배수.
    """
    before = (holder_bps or settings.royalty_holder_bps) / BPS
    after = (holder_after_bps or settings.royalty_holder_after_bps) / BPS
    per = paying_fans * monthly_net_per_paying_fan() * (1 - settings.dividend_tax_bps / BPS)
    flows, cum, recouped_q, payback = [], 0.0, None, None
    for m, level in enumerate(season_curve()):
        q = m // 3
        share = after if recouped_q is not None and q > recouped_q else before
        x = level * per * share
        cum += x
        flows.append(x)
        if payback is None and cum >= target_amount:
            payback = m + 1
        if recouped_q is None and m % 3 == 2 and cum >= target_amount:
            recouped_q = q
    multiple = round(cum / target_amount, 2) if target_amount else None
    return {"monthly_flows": flows, "payback_months": payback, "multiple": multiple, "total": round(cum)}


def lifetime_take_per_paying_fan() -> float:
    """유료 팬 1명당 상품 기간 전체 투자자 몫(세후). 상한 산정용이라 첫 분기 뒤로는 회수 후 비율로 보수적으로 잡는다."""
    return sum(simulate(0, 1)["monthly_flows"])


def target_cap(expected_paying_fans: int) -> int:
    """목표 금액 상한 = 예상 유료 팬 × 1명당 투자자 몫(상품 기간 전체) × 70%. 100만 원 단위 내림."""
    raw = expected_paying_fans * lifetime_take_per_paying_fan() * settings.cap_safety_bps / BPS
    return int(raw // 1_000_000 * 1_000_000)


def paying_fans_needed(target_amount: int) -> int:
    """목표 금액을 상한 안에 두는 데 필요한 월 유료 팬 (결제율 가정과 무관)."""
    return math.ceil(target_amount / (lifetime_take_per_paying_fan() * settings.cap_safety_bps / BPS))


def pilot_readers(db: Session, work_id: int, days: int = 28) -> int:
    """최근 4주 파일럿 열람자 = 회차 열람을 시작한 고유 사용자(로그인·비로그인). 참고 지표."""
    since = clock.now() - timedelta(days=days)
    users = db.scalar(select(func.count(distinct(ContentEvent.user_id))).where(
        ContentEvent.work_id == work_id, ContentEvent.event_type == EventType.VIEW_START,
        ContentEvent.occurred_at >= since, ContentEvent.user_id.is_not(None))) or 0
    anons = db.scalar(select(func.count(distinct(ContentEvent.anon_id))).where(
        ContentEvent.work_id == work_id, ContentEvent.event_type == EventType.VIEW_START,
        ContentEvent.occurred_at >= since, ContentEvent.user_id.is_(None), ContentEvent.anon_id.is_not(None))) or 0
    return int(users + anons)


def pilot_paying_fans(db: Session, work_id: int, days: int = 28) -> int:
    """최근 4주 유료 미리보기를 한 번 이상 산 고유 사용자 = 월 유료 팬 (발행 조건의 기준)."""
    since = clock.now() - timedelta(days=days)
    return int(db.scalar(select(func.count(distinct(EpisodeUnlock.user_id))).where(
        EpisodeUnlock.work_id == work_id, EpisodeUnlock.unlocked_at >= since)) or 0)


def funding_gate(db: Session, work_id: int, target_amount: int) -> dict:
    fans = pilot_paying_fans(db, work_id)
    need = paying_fans_needed(target_amount)
    threshold = math.ceil(need * settings.gate_ratio_bps / BPS)
    cap = target_cap(fans)
    return {
        "pilot_readers_4w": pilot_readers(db, work_id),
        "pilot_paying_fans_4w": fans,
        "paying_fans_needed": need,
        "gate_threshold": threshold,
        "passes_gate": fans >= threshold,
        "target_cap": cap,
        "within_cap": target_amount <= cap,
        "enforced": settings.enforce_funding_gate,
    }


def check_funding_gate(db: Session, work_id: int, target_amount: int) -> dict:
    g = funding_gate(db, work_id, target_amount)
    if settings.enforce_funding_gate:
        if not g["passes_gate"]:
            raise Conflict("FUNDING_GATE_NOT_MET",
                           f"파일럿 4주 유료 구매자가 {g['gate_threshold']:,}명 이상이어야 펀딩을 열 수 있어요 "
                           f"(현재 {g['pilot_paying_fans_4w']:,}명)")
        if not g["within_cap"]:
            raise DomainError("TARGET_OVER_CAP", f"목표 금액은 {g['target_cap']:,}원을 넘을 수 없어요")
    return g


# ───────────────────────────── 투자 지표 카드 (청약 화면) ─────────────────────────────

SCENARIOS = {  # 파일럿 유료 팬 대비 실제 유료 팬 비율 — 기획서 v5.0 5장
    "downside": 0.4,
    "conservative": 0.7,
    "base": 1.0,
    "optimistic": 1.5,
}


def indicators(db: Session, f: Funding) -> dict:
    """발행 전 투자 지표: 수요(찜·열람·연독·유료 팬) → 시나리오별 총회수 배수와 원금 회수 달.

    기간이 짧아 연 수익률(IRR)은 과장되어 보이므로 배수와 회수 기간만 보여 준다.
    """
    now = clock.now()
    viewer = func.coalesce(literal("u") + cast(ContentEvent.user_id, String), literal("a") + ContentEvent.anon_id)
    from app.models import Dib, Episode

    def uniq(event: EventType, episode_id: int | None = None) -> int:
        q = select(func.count(distinct(viewer))).where(ContentEvent.work_id == f.work_id,
                                                       ContentEvent.event_type == event)
        if episode_id is not None:
            q = q.where(ContentEvent.episode_id == episode_id)
        return int(db.scalar(q) or 0)

    eps = list(db.scalars(select(Episode).where(Episode.work_id == f.work_id,
                                                Episode.no <= settings.pilot_free_episodes).order_by(Episode.no)))
    first = uniq(EventType.VIEW_COMPLETE, eps[0].id) if eps else 0
    last = uniq(EventType.VIEW_COMPLETE, eps[-1].id) if eps else 0
    dibs = int(db.scalar(select(func.count()).where(Dib.work_id == f.work_id)) or 0)
    dibs_7d = int(db.scalar(select(func.count()).where(Dib.work_id == f.work_id,
                                                       Dib.created_at >= now - timedelta(days=7))) or 0)
    gate = funding_gate(db, f.work_id, f.target_amount)
    fans = gate["pilot_paying_fans_4w"]
    scenarios = {}
    for name, ratio in SCENARIOS.items():
        r = simulate(f.target_amount, fans * ratio, f.royalty_holder_bps, f.royalty_holder_after_bps)
        scenarios[name] = {"fan_ratio": ratio, "multiple": r["multiple"] if fans else None,
                           "payback_months": r["payback_months"] if fans else None}
    cap_amount = per_user_cap_amount(f.target_amount)
    worst = scenarios["downside"]["multiple"]
    return {
        "funding_id": f.id,
        "dibs_total": dibs,
        "dibs_7d": dibs_7d,
        "pilot_readers_4w": gate["pilot_readers_4w"],
        "pilot_read_through": round(last / first, 3) if first else None,
        "pilot_paying_fans_4w": fans,
        "paying_fans_needed": gate["paying_fans_needed"],
        "gate_threshold": gate["gate_threshold"],
        "passes_gate": gate["passes_gate"],
        "target_cap": gate["target_cap"],
        "season_months": settings.season_months,
        "tail_months": settings.tail_months,
        "scenarios": scenarios,
        "per_user_cap_amount": cap_amount,
        "per_user_max_loss_downside": round(cap_amount * (1 - worst)) if worst is not None and worst < 1 else 0,
        "note": "수익을 보장하지 않는 추정이에요. 상품 기간이 짧아 연 수익률 대신 총회수 배수와 회수 기간만 보여 줘요.",
    }


# ───────────────────────────── 회수 우선 배분 ─────────────────────────────

def after_tax(amount: int) -> int:
    return amount * (BPS - settings.dividend_tax_bps) // BPS


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
        "cumulative_holder_net": after_tax(cum),
        "issuance_amount": f.target_amount,
        "progress_pct": round(min(after_tax(cum) * 100 / f.target_amount, 100), 1) if f.target_amount else 0.0,
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

    due = None
    if f.completed_at:  # 완결 후 12개월과 상장 후 24개월 중 늦은 쪽 (조기 완결해도 투자자 기간 보전)
        due = add_months(f.completed_at, settings.termination_after_completion_months)
        if f.listed_at:
            due = max(due, add_months(f.listed_at, settings.min_term_after_listing_months))
    threshold = f.target_amount * settings.low_revenue_bps // BPS
    streak = 0
    for r in _recent_runs(db, f, settings.low_revenue_quarters):
        if r.net_revenue < threshold:
            streak += 1
        else:
            break
    reason = None
    if due and clock.now() >= due:
        reason = "COMPLETED_TERM"
    elif streak >= settings.low_revenue_quarters:
        reason = "LOW_REVENUE"
    return {"completed_at": f.completed_at, "terminate_due_at": due, "low_revenue_threshold": threshold,
            "low_revenue_streak": streak, "eligible": reason is not None, "reason": reason,
            "buyback_enabled": f.buyback_enabled,
            "buyback_price": buyback_price(db, f) if f.buyback_enabled else None}


def _holders(db: Session, f: Funding) -> list[Holding]:
    return list(db.scalars(select(Holding).where(Holding.funding_id == f.id, Holding.mode == f.mode,
                                                 Holding.units > 0).order_by(Holding.user_id)))


def _require_live(f: Funding) -> None:
    if f.status not in (FundingStatus.LISTED, FundingStatus.SUSPENDED):
        raise Conflict("INVALID_FUNDING_STATUS", f"현재 상태({f.status})에서는 할 수 없어요")


def mark_completed(db: Session, f: Funding) -> dict:
    """완결 확정: services/serial.py (약정 회차 전이면 조기 완결 감액)."""
    from app.services import serial

    return serial.complete_season(db, f)


def terminate(db: Session, f: Funding, force: bool = False) -> Funding:
    """종료 규칙 충족 시 권리 종료. 원금 상환은 없고, 이미 계산한 분기 배당은 그대로 지급한다."""
    _require_live(f)
    chk = termination_check(db, f)
    if not chk["eligible"] and not force:
        raise Conflict("TERMINATION_NOT_DUE", "종료 조건(완결 후 12개월 또는 저매출 2분기 연속)을 충족하지 않았어요")
    work = db.get(Work, f.work_id)
    for h in _holders(db, f):
        notify(db, h.user_id, "TERMINATED", f"「{work.title}」 수익 배분 권리가 종료됐어요",
               "이미 계산된 분기 배당은 예정대로 지급돼요. 원금 상환은 없어요.", "funding", f.id)
    f.status, f.terminated_at, f.termination_reason = FundingStatus.TERMINATED, clock.now(), chk["reason"] or "FORCED"
    from app.services import serial

    serial.release_escrow(db, f, "권리 종료")
    return f


def buyback(db: Session, f: Funding, creator_id: int) -> dict:
    """작가 매입 옵션: 매입가를 보유 비율대로 지급하고 권리를 종료한다."""
    _require_live(f)
    if not f.buyback_enabled:
        raise Conflict("BUYBACK_NOT_ENABLED", "이 펀딩은 작가 매입 옵션을 선택하지 않았어요")
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
    from app.services import serial

    serial.release_escrow(db, f, "작가 매입으로 권리 종료")
    return {"price": price, "paid": paid, "holders": len(holders)}
