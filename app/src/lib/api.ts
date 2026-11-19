// DIBS 백엔드 API 클라이언트. 엔드포인트 목록은 백엔드 docs/SCREEN_API_MAP.md 기준.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO, demoRequest } from './demo';
import Constants from 'expo-constants';

const KEY_BASE = 'dibs.baseUrl';
const KEY_TOKEN = 'dibs.token';

let baseUrl = '';
let token: string | null = null;

/** Expo Go 로 열면 Metro 주소(예: 192.168.0.10:8081)에서 PC IP 를 알아내 백엔드 기본 주소로 쓴다. */
export function guessBaseUrl(): string {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:8000` : 'http://localhost:8000';
}

// 저장소를 못 쓰는 환경(샌드박스 프레임 등)에서도 앱이 멈추지 않게 한다
const store = {
  get: async (k: string) => { try { return await AsyncStorage.getItem(k); } catch { return null; } },
  set: async (k: string, v: string) => { try { await AsyncStorage.setItem(k, v); } catch { /* 무시 */ } },
  del: async (k: string) => { try { await AsyncStorage.removeItem(k); } catch { /* 무시 */ } },
};

export async function loadConfig() {
  baseUrl = (await store.get(KEY_BASE)) || guessBaseUrl();
  token = await store.get(KEY_TOKEN);
  if (DEMO && !token) token = 'demo-token'; // 정적 데모: 시연 계정(reader1)으로 바로 시작
  return { baseUrl, token };
}

export async function setBaseUrl(url: string) {
  baseUrl = url.replace(/\/+$/, '');
  await store.set(KEY_BASE, baseUrl);
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await store.set(KEY_TOKEN, t);
  else await store.del(KEY_TOKEN);
}

export const getBaseUrl = () => baseUrl;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  if (DEMO) {
    try {
      return (await demoRequest(method, path, body, query)) as T;
    } catch (e) {
      const x = e as { status?: number; code?: string; message: string };
      throw new ApiError(x.status ?? 400, x.code ?? 'DEMO', x.message);
    }
  }
  const qs = query
    ? '?' +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}${qs}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', `서버(${baseUrl})에 연결할 수 없어요. 같은 와이파이인지, 서버를 0.0.0.0 으로 켰는지 확인해 주세요`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_' + res.status, err?.message ?? '요청을 처리하지 못했어요');
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, body ?? {}, query),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** 이용 이벤트 (찜·연독률 분석 원천). 실패해도 화면에는 영향 없음. */
export function track(event_type: string, ids: { work_id?: number; episode_id?: number; short_id?: number; funding_id?: number; progress?: number; referrer?: string } = {}) {
  const { referrer, ...rest } = ids;
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19);
  api
    .post('/events', { events: [{ event_type, occurred_at: kst, anon_id: 'expo-app', ...rest, props: { platform: 'expo', referrer } }] })
    .catch(() => {});
}

// ── 응답 타입 (백엔드 스키마 중 화면에서 쓰는 필드만) ──
export type Me = {
  id: number; email: string; nickname: string; role: 'READER' | 'CREATOR' | 'ADMIN';
  kyc_verified: boolean; risk_level: string | null; risk_checked_at: string | null; bio: string;
  broker_name: string | null; broker_account_masked: string | null;
};
export type Progress = { requested_units: number; raised_amount: number; participants: number; achievement_pct: number };
export type WorkCard = { id: number; title: string; genre: string; type: string; synopsis: string; cover_url?: string | null; creator_id: number; dib_count: number; funding_id: number | null; funding_status: string | null };
export type WorkDetail = WorkCard & { is_dibbed: boolean; episode_count: number };
export type Episode = { id: number; no: number; title: string; is_paid: boolean; paid_preview: boolean; price_coin: number; free_unlock_at: string | null; unlocked: boolean };
export type FundingCard = { id: number; work_id: number; work_title: string; status: string; mode: string; unit_price: number; target_units: number; target_amount: number; close_at: string | null; days_left: number | null; progress: Progress };
export type RewardTier = { id: number; title: string; description: string; min_units: number; limited_qty: number | null; requires_shipping: boolean };
export type FundingDetail = FundingCard & {
  use_of_funds: string; risk_note: string; max_units_per_user: number | null; open_at: string | null; lock_at: string | null;
  per_user_cap_units: number; risk_grade: string;
  recoup: Recoup;
  termination: Termination | null;
  reward_tiers: RewardTier[];
  terms: {
    allocation_strategy: string; allocation_params: { equal_ratio_bps?: number; early_reader_bps?: number };
    creator_bps: number; issuance_cost_bps: number; platform_fee_bps: number;
    royalty_platform_bps: number; royalty_creator_bps: number; royalty_holder_bps: number;
    royalty_platform_after_bps: number; royalty_creator_after_bps: number; royalty_holder_after_bps: number;
    exclusive_months: number; exclusive_until: string | null; external_share_bps: number;
    buyback_enabled: boolean;
  };
};
/** 회수 우선 배분: 누적 세전 분배금이 발행액에 닿은 다음 분기부터 투자자 몫 45% → 35% */
export type Recoup = { phase: 'BEFORE_RECOUP' | 'AFTER_RECOUP'; recouped_period: string | null; cumulative_holder_gross: number; issuance_amount: number; progress_pct: number; holder_bps_now: number; holder_bps_before: number; holder_bps_after: number };
/** 시즌 단위 (v5.0). 완결 후 12개월 또는 저매출 2분기 연속이면 종료. 작가 매입은 선택한 펀딩만 (최근 4분기 분배금 × 3) */
export type Termination = { completed_at: string | null; terminate_due_at: string | null; low_revenue_threshold: number; low_revenue_streak: number; eligible: boolean; reason: string | null; buyback_enabled: boolean; buyback_price: number | null };
export type Scenario = { fan_ratio: number; multiple: number | null; payback_months: number | null };
/** 발행 전 투자 지표 카드: 수요 → 유료 팬 → 시나리오별 총회수 배수와 원금 회수 달 (연 수익률은 표시하지 않음) */
export type Indicators = {
  funding_id: number; dibs_total: number; dibs_7d: number; pilot_readers_4w: number; pilot_read_through: number | null;
  pilot_paying_fans_4w: number; paying_fans_needed: number; gate_threshold: number; passes_gate: boolean; target_cap: number;
  season_months: number; tail_months: number;
  scenarios: { downside: Scenario; conservative: Scenario; base: Scenario; optimistic: Scenario };
  per_user_cap_amount: number; per_user_max_loss_downside: number; note: string;
};
export type Reconciliation = { period: string; unlock_gross: number; trust_inflow: number; recorded_gross: number | null; leaked_unlocks: number; matched: boolean; ledger_hash: string; records: number };
/** 공시: 투자금 쓰임·매출 배분·상품 기간·분기별 정산 대사와 원장 해시 */
export type Disclosure = {
  funding_id: number;
  cost_per_100: { creator: number; issuance_cost: number; dibs: number };
  term: { season_months: number; after_completion_months: number; principal_repayment: boolean };
  per_user_cap_amount: number; buyback_enabled: boolean; settlement_basis: string; verification: string[];
  reconciliation: Reconciliation[];
};
/** 연재 약정·진행 (태업·조기 완결·귀책 중단 대비) */
export type SerialState = 'ON_TRACK' | 'WARNING' | 'BREACH' | 'COMPLETED' | 'EARLY_COMPLETED' | 'DISCONTINUED';
export type Serial = {
  committed_episodes: number; monthly_quota: number; buffer_episodes: number | null; required_buffer: number;
  published: number; expected: number; delay_episodes: number; hiatus_weeks_used: number; hiatus_limit_weeks: number;
  state: SerialState; next_payout_at_episode: number | null; discontinue_kind: 'FAULT' | 'NO_FAULT' | null;
  creator_escrow_balance: number; clawback_due: number; clawback_collected: number; clawback_outstanding: number;
  rules: { delay_warning_episodes: number; delay_breach_episodes: number; clawback_bps: number; creator_escrow_bps: number; min_term_after_listing_months: number };
  special_distributions: { id: number; kind: string; amount: number; status: string; holders: number; created_at: string }[];
};
/** B안 증권사 연계 */
export type PublicConfig = { subscription_channel: 'INTERNAL' | 'BROKER'; broker_name: string; trading_mode: string; partner_coupon_coin: number; first_time_cap_amount: number };
export type Handoff = { channel: string; broker: string; deeplink: string; token: string; expires_at: string; linked: boolean };
export type MockKiwoomResult = { subscription_id: number; units: number; link: { link_ref: string; coupon_coin: number } | null };
export type Breakeven = { lines: { goal: string; holder_dividend_per_year: number; paid_unlocks_per_month: number; buyers_per_episode: number; monthly_readers: number }[]; price_coin: number; monthly_episodes: number };
export type Subscription = { id: number; funding_id: number; units: number; status: string; allocated_units: number | null; requested_tier_id: number | null; assigned_tier_id: number | null };
export type MySubscription = Subscription & { work_title: string; unit_price: number; funding_status: string; close_at: string | null; requested_tier_title: string | null; assigned_tier_title: string | null; tracking_no: string | null };
export type Wallet = { mode: string; coin: number; deposit_available: number; deposit_locked: number };
export type Limits = { annual_remaining: number; security_remaining?: number; annual_limit: number; security_limit?: number };
export type SecurityItem = { funding_id: number; work_id: number; work_title: string; status: string; unit_price: number; reference_price: number | null; last_price: number | null; change_pct: number | null };
export type SecurityDetail = SecurityItem & {
  security_code: string | null; total_units: number; price_band: { min: number | null; max: number | null };
  volume_7d: number; trades_7d: number; dividend_4q_per_unit: number; price_to_dividend: number | null;
  recoup_phase: 'BEFORE_RECOUP' | 'AFTER_RECOUP'; recoup_progress_pct: number; royalty_holder_after_bps: number; buyback_enabled: boolean; buyback_price: number | null; terminate_due_at: string | null;
  my_units: number | null; my_avg_price: number | null; royalty_holder_bps: number;
};
export type BookLevel = { price: number; units: number; orders: number };
export type OrderBook = { bids: BookLevel[]; asks: BookLevel[]; reference_price: number | null; last_price: number | null; price_band: { min: number | null; max: number | null } };
export type Trade = { id: number; price: number; units: number; created_at: string };
export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type OrderPreview = { gross: number; fee: number; fee_ppm: number; total: number; available_deposit: number; available_units: number; annual_remaining: number; security_remaining: number; can_place: boolean; reasons: string[]; price_band: { min: number | null; max: number | null } };
export type Order = { id: number; funding_id: number; side: 'BUY' | 'SELL'; price: number; units: number; remaining_units: number; status: string; created_at: string };
export type Holding = { funding_id: number; work_title: string; mode: string; units: number; locked_units: number; avg_price: number; last_price: number | null; eval_amount: number; pnl: number; pnl_pct: number | null };
export type DividendPayment = { run_id: number; funding_id: number; work_title: string; period: string; pay_date: string; status: string; units: number; gross: number; tax: number; net: number };
export type Notification = { id: number; type: string; title: string; body: string; ref_type: string | null; ref_id: number | null; is_read: boolean; created_at: string };
export type ShortItem = { id: number; work_id: number; title: string; video_url: string; duration_sec: number; work_title: string; funding_id: number | null; funding_status: string | null };
export type LedgerLine = { journal_id: number; kind: string; account: string; amount: number; created_at: string };
