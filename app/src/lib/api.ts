// DIBS 백엔드 API 클라이언트. 엔드포인트 목록은 백엔드 docs/SCREEN_API_MAP.md 기준.
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export async function loadConfig() {
  baseUrl = (await AsyncStorage.getItem(KEY_BASE)) || guessBaseUrl();
  token = await AsyncStorage.getItem(KEY_TOKEN);
  return { baseUrl, token };
}

export async function setBaseUrl(url: string) {
  baseUrl = url.replace(/\/+$/, '');
  await AsyncStorage.setItem(KEY_BASE, baseUrl);
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem(KEY_TOKEN, t);
  else await AsyncStorage.removeItem(KEY_TOKEN);
}

export const getBaseUrl = () => baseUrl;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
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
export type WorkCard = { id: number; title: string; genre: string; type: string; synopsis: string; creator_id: number; dib_count: number; funding_id: number | null; funding_status: string | null };
export type WorkDetail = WorkCard & { is_dibbed: boolean; episode_count: number };
export type Episode = { id: number; no: number; title: string; is_paid: boolean; price_coin: number; unlocked: boolean };
export type FundingCard = { id: number; work_id: number; work_title: string; status: string; mode: string; unit_price: number; target_units: number; target_amount: number; close_at: string | null; days_left: number | null; progress: Progress };
export type RewardTier = { id: number; title: string; description: string; min_units: number; limited_qty: number | null; requires_shipping: boolean };
export type FundingDetail = FundingCard & {
  use_of_funds: string; risk_note: string; max_units_per_user: number | null; open_at: string | null; lock_at: string | null; maturity_date: string | null;
  reward_tiers: RewardTier[];
  terms: { allocation_strategy: string; allocation_params: { equal_ratio_bps?: number }; creator_bps: number; issuance_cost_bps: number; platform_fee_bps: number; royalty_platform_bps: number; royalty_creator_bps: number; royalty_holder_bps: number; operating_period_months: number; exclusive_months: number; exclusive_until: string | null; external_share_bps: number };
};
export type Breakeven = { lines: { goal: string; holder_dividend_per_year: number; paid_unlocks_per_month: number; buyers_per_episode: number }[]; price_coin: number; monthly_episodes: number };
export type Subscription = { id: number; funding_id: number; units: number; status: string; allocated_units: number | null; requested_tier_id: number | null; assigned_tier_id: number | null };
export type MySubscription = Subscription & { work_title: string; unit_price: number; funding_status: string; close_at: string | null; requested_tier_title: string | null; assigned_tier_title: string | null; tracking_no: string | null };
export type Wallet = { mode: string; coin: number; deposit_available: number; deposit_locked: number };
export type Limits = { annual_remaining: number; security_remaining?: number; annual_limit: number; security_limit?: number };
export type SecurityItem = { funding_id: number; work_id: number; work_title: string; status: string; unit_price: number; reference_price: number | null; last_price: number | null; change_pct: number | null };
export type SecurityDetail = SecurityItem & {
  security_code: string | null; total_units: number; price_band: { min: number | null; max: number | null };
  volume_7d: number; trades_7d: number; dividend_4q_per_unit: number; price_to_dividend: number | null; maturity_date: string | null;
  my_units: number | null; my_avg_price: number | null; royalty_holder_bps: number;
};
export type BookLevel = { price: number; units: number; orders: number };
export type OrderBook = { bids: BookLevel[]; asks: BookLevel[]; reference_price: number | null; last_price: number | null; price_band: { min: number | null; max: number | null } };
export type Trade = { id: number; price: number; units: number; created_at: string };
export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type OrderPreview = { gross: number; fee: number; fee_bps: number; total: number; available_deposit: number; available_units: number; annual_remaining: number; security_remaining: number; can_place: boolean; reasons: string[]; price_band: { min: number | null; max: number | null } };
export type Order = { id: number; funding_id: number; side: 'BUY' | 'SELL'; price: number; units: number; remaining_units: number; status: string; created_at: string };
export type Holding = { funding_id: number; work_title: string; mode: string; units: number; locked_units: number; avg_price: number; last_price: number | null; eval_amount: number; pnl: number; pnl_pct: number | null };
export type DividendPayment = { run_id: number; funding_id: number; work_title: string; period: string; pay_date: string; status: string; units: number; gross: number; tax: number; net: number };
export type Notification = { id: number; type: string; title: string; body: string; ref_type: string | null; ref_id: number | null; is_read: boolean; created_at: string };
export type ShortItem = { id: number; work_id: number; title: string; duration_sec: number; work_title: string; funding_id: number | null; funding_status: string | null };
export type LedgerLine = { journal_id: number; kind: string; account: string; amount: number; created_at: string };
