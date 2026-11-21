// 정적 배포용 데모 모드 (EXPO_PUBLIC_DEMO=1).
// 서버 없이 돌아가도록, 시연 데이터베이스에서 미리 받아 둔 응답(demo-fixtures.json)으로 GET 을 답하고
// 쓰기 요청(청약·찜·주문 등)은 화면 흐름이 이어지도록 그럴듯한 응답을 돌려준다. 실제 저장은 하지 않는다.
import fixtures from './demo-fixtures.json';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { scoreToLevel } from './risk';

type Query = Record<string, string | number | boolean | undefined | null> | undefined;
const F = fixtures as Record<string, unknown>;

const local: Record<string, unknown> = {};

export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

// ── 열람 리워드·유료 회차 (정적 데모용 상태) ──
type EpMeta = { id: number; work_id: number; no: number; title: string; is_paid: boolean; price_coin: number };
const unlocked = new Set<number>();
let attended = false;
let points = 3000;
let kiwoomCoupon = false;
function episodeMeta(id: number): (EpMeta & { work_id: number }) | null {
  for (const [k, v] of Object.entries(F)) {
    const m = k.match(/^\/works\/(\d+)\/episodes$/);
    if (!m || !Array.isArray(v)) continue;
    const e = (v as EpMeta[]).find((x) => x.id === id);
    if (e) return { ...e, work_id: Number(m[1]) };
  }
  return null;
}
function wallet() {
  return (local['/wallet'] ?? F['/wallet']) as { coin: number } & Record<string, unknown>;
}
function addCoin(n: number) {
  const w = clone(wallet());
  w.coin += n;
  local['/wallet'] = w;
}
// ── 돈 흐름 (예치금 = 키움증권 연결 계좌 잔액). 청약·충전·출금이 지갑·내 펀딩·MY·펀딩 진행률에 함께 반영되게 ──
type W = { mode: string; coin: number; deposit_available: number; deposit_locked: number };
type Line = { journal_id: number; kind: string; account: string; amount: number; mode: string; ref_type: string | null; ref_id: number | null; memo: string | null; created_at: string };
let jid = 90000;
const nowIso = () => new Date(Date.parse('2027-03-02T09:00:00+09:00') + (Date.now() - T0)).toISOString().slice(0, 19);
const T0 = Date.now();
function setW(fn: (w: W) => void) { const w = clone(wallet()) as unknown as W; fn(w); local['/wallet'] = w; }
function line(kind: string, account: string, amount: number, ref?: [string, number], memo?: string) {
  const h = clone(((local['/wallet/history?limit=30'] ?? F['/wallet/history?limit=30'] ?? local['/wallet/history'] ?? F['/wallet/history']) ?? []) as Line[]);
  h.unshift({ journal_id: ++jid, kind, account, amount, mode: 'MOCK', ref_type: ref?.[0] ?? null, ref_id: ref?.[1] ?? null, memo: memo ?? null, created_at: nowIso() });
  local['/wallet/history?limit=30'] = h; local['/wallet/history'] = h;
}
const err = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code });
type Prog = { requested_units: number; raised_amount: number; participants: number; achievement_pct: number };
type Fd = { id: number; work_id: number; work_title: string; status: string; unit_price: number; target_units: number; close_at: string | null; progress: Prog };
function bumpProgress(fid: number, delta: number, newcomer: number) {
  const upd = (f: Fd) => {
    const p = f.progress;
    p.requested_units += delta; p.raised_amount = p.requested_units * f.unit_price; p.participants += newcomer;
    p.achievement_pct = Math.round((p.requested_units / f.target_units) * 1000) / 10;
  };
  for (const k of [`/fundings/${fid}`]) { const f = clone((local[k] ?? F[k]) as Fd | undefined); if (f?.progress) { upd(f); local[k] = f; } }
  for (const k of ['/fundings?status=OPEN', '/fundings']) {
    const l = clone((local[k] ?? F[k]) as Fd[] | undefined);
    if (Array.isArray(l)) { l.filter((f) => f.id === fid && f.progress).forEach(upd); local[k] = l; }
  }
}
/** 청약하기·수량 바꾸기·취소 (DIBS 화면이든 키움 화면이든 같은 예치금에서) */
function subscribe(fid: number, units: number) {
  const f = (local[`/fundings/${fid}`] ?? F[`/fundings/${fid}`]) as Fd | undefined;
  if (!f) throw err(404, 'NOT_FOUND', '펀딩을 찾을 수 없어요');
  const subs = clone(((local['/me/subscriptions'] ?? F['/me/subscriptions']) ?? []) as Record<string, unknown>[]);
  const cur = subs.find((x) => x.funding_id === fid && x.status === 'ACTIVE');
  const prev = (cur?.units as number | undefined) ?? 0;
  const delta = units - prev;
  const amt = delta * f.unit_price;
  if (amt > (wallet() as unknown as W).deposit_available) throw err(409, 'INSUFFICIENT_BALANCE', `예치금이 ${(amt - (wallet() as unknown as W).deposit_available).toLocaleString('ko-KR')}원 모자라요. 충전하고 다시 시도해 주세요`);
  setW((w) => { w.deposit_available -= amt; w.deposit_locked += amt; });
  if (amt) line(units === 0 ? 'SUBSCRIPTION_UNLOCK' : delta > 0 ? 'SUBSCRIPTION_LOCK' : 'SUBSCRIPTION_UNLOCK', 'DEPOSIT', -amt, ['funding', fid]);
  let sub: Record<string, unknown>;
  if (cur) { cur.units = units; if (units === 0) cur.status = 'CANCELLED'; sub = cur; }
  else {
    sub = { id: 9000 + fid, funding_id: fid, user_id: 3, units, status: 'ACTIVE', allocated_units: null, requested_tier_id: null, assigned_tier_id: null, first_subscribed_at: nowIso(),
      work_title: f.work_title, unit_price: f.unit_price, funding_status: f.status, close_at: f.close_at, requested_tier_title: null, assigned_tier_title: null, tracking_carrier: null, tracking_no: null };
    subs.unshift(sub);
  }
  local['/me/subscriptions'] = subs;
  local[`/fundings/${fid}/subscriptions/me`] = units === 0 ? undefined : sub;
  if (units === 0) delete local[`/fundings/${fid}/subscriptions/me`];
  bumpProgress(fid, delta, cur ? (units === 0 ? -1 : 0) : 1);
  return sub;
}

const LADDER = [50, 50, 200, 50, 50, 50, 300];
const PRIOR = 2; // 시연 계정: 어제까지 2일 연속 출석 → 오늘은 3일째(200코인)
function attendanceState() {
  const streak = PRIOR + (attended ? 1 : 0);
  const filled = attended ? ((streak - 1) % 7) + 1 : streak % 7;
  return { today: '2027-03-02', checked: attended, streak, ladder: LADDER, filled, today_coin: LADDER[attended ? filled - 1 : filled], week_total: 750 };
}

function key(path: string, query: Query) {
  const q = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');
  return q ? `${path}?${q}` : path;
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

// ── 시연 상태 저장: 새로고침·앱 재실행에도 청약·충전·찜 같은 결과가 남게 (MY > 시연 처음부터 로 초기화) ──
const SAVE_KEY = 'dibs.demoState';
export async function loadDemoState() {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as { local: Record<string, unknown>; unlocked: number[]; attended: boolean; points: number; kiwoomCoupon: boolean; jid: number };
    Object.assign(local, d.local ?? {});
    (d.unlocked ?? []).forEach((x) => unlocked.add(x));
    attended = !!d.attended; points = d.points ?? 3000; kiwoomCoupon = !!d.kiwoomCoupon; jid = d.jid ?? jid;
  } catch { /* 무시 */ }
}
function saveDemoState() {
  AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ local, unlocked: [...unlocked], attended, points, kiwoomCoupon, jid })).catch(() => {});
}
/** 시연 처음부터: 저장한 시연 상태와 기기 설정(출석·키움 연결·좋아요 등)을 지운다 */
export async function resetDemoState() {
  const keys = (await AsyncStorage.getAllKeys().catch(() => [] as readonly string[])).filter((k) => k.startsWith('dibs.') && k !== 'dibs.introSeen' && k !== 'dibs.token' && k !== 'dibs.baseUrl');
  await AsyncStorage.multiRemove(keys).catch(() => {});
  for (const k of Object.keys(local)) delete local[k];
  unlocked.clear(); attended = false; points = 3000; kiwoomCoupon = false;
}

export async function demoRequest(method: string, path: string, body?: unknown, query?: Query): Promise<unknown> {
  const out = await demoRequestInner(method, path, body, query);
  if (method !== 'GET') saveDemoState();
  return out;
}

async function demoRequestInner(method: string, path: string, body?: unknown, query?: Query): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120)); // 네트워크처럼 보이게
  if (method === 'GET') {
    const k = key(path, query);
    if (k in local) return clone(local[k]);
    const epm = path.match(/^\/episodes\/(\d+)$/);
    if (epm && !(k in F)) {
      // 유료 회차: 열기 전에는 결제 필요, 연 뒤에는 회차 정보로 보여 준다
      const meta = episodeMeta(Number(epm[1]));
      if (!meta) throw Object.assign(new Error('회차를 찾을 수 없어요'), { status: 404, code: 'NOT_FOUND' });
      if (!unlocked.has(meta.id)) throw Object.assign(new Error(`이어서 보려면 ${meta.price_coin}코인이 필요해요`), { status: 402, code: 'PAYMENT_REQUIRED' });
      return { ...meta, content_url: `https://cdn.example/${meta.work_id}/${meta.no}` };
    }
    const op = path.match(/^\/market\/securities\/(\d+)\/order-preview$/);
    if (op) {
      // 주문 미리보기: 입력한 가격·수량으로 다시 계산 (수수료 0.015%, 원 미만 버림)
      const base = Object.entries(F).find(([kk]) => kk.startsWith(`${path}?`) && kk.includes(`side=${query?.side ?? 'BUY'}`))?.[1] as Record<string, unknown> | undefined;
      const price = Number(query?.price ?? 0), units = Number(query?.units ?? 1);
      const gross = price * units, fee = Math.floor((gross * 150) / 1_000_000);
      const w = wallet() as unknown as W;
      const band = (base?.price_band ?? { min: 0, max: 0 }) as { min: number; max: number };
      const reasons = [price < band.min || price > band.max ? '가격 제한폭(±30%)을 벗어났어요' : null, query?.side !== 'SELL' && gross + fee > w.deposit_available ? '예치금이 모자라요' : null].filter(Boolean);
      return { ...(base ?? {}), side: query?.side ?? 'BUY', price, units, gross, fee, total: query?.side === 'SELL' ? gross - fee : gross + fee, available_deposit: w.deposit_available, can_place: reasons.length === 0, reasons };
    }
    if (path === '/me/attendance') return attendanceState();
    if (path === '/me/partner-points') return { broker: '키움증권', balance: points, converted: 3000 - points, unit: 100, rate: 1 };
    if (k in F) return clone(F[k]);
    // 검색어(q)가 있으면 검색어 없는 목록에서 제목으로 거른다
    if (query?.q && path === '/works') {
      const { q, ...rest } = query;
      const all = (F[key(path, rest)] ?? F[key(path, { limit: 100 })] ?? []) as { title: string; genre: string }[];
      return all.filter((w) => w.title.includes(String(q)) || w.genre.includes(String(q)));
    }
    if (path in F) return clone(F[path]);
    const prefix = Object.keys(F).find((x) => x.startsWith(`${path}?`));
    if (prefix) return clone(F[prefix]);
    if (/\/(subscriptions\/me)$/.test(path) || /^\/fundings\/\d+$/.test(path)) throw Object.assign(new Error('없음'), { status: 404, code: 'NOT_FOUND' });
    if (path.endsWith('/orderbook')) return { bids: [], asks: [], reference_price: null, last_price: null, price_band: { min: null, max: null } };
    return path.endsWith('s') || /\/(feed|chart|trades|history)$/.test(path) ? [] : {};
  }
  // ── 쓰기 요청 ──
  if (path === '/auth/dev-login') return { access_token: 'demo-token' };
  // 간편 로그인·휴대폰 인증: 정적 데모는 서버가 없어 시연 계정(reader1)으로 바로 들어간다
  if (/^\/auth\/social\/[a-z]+\/token$/.test(path)) return { access_token: 'demo-token', user_id: 3, is_new: false };
  if (path === '/auth/phone/request') return { expires_in: 180, dev_code: '123456' };
  if (path === '/auth/phone/verify') {
    if ((body as { code?: string })?.code !== '123456') throw Object.assign(new Error('인증번호가 맞지 않아요 (1/5)'), { status: 400, code: 'OTP_MISMATCH' });
    return { access_token: 'demo-token', user_id: 3, is_new: false };
  }
  const un = path.match(/^\/episodes\/(\d+)\/unlock$/);
  if (un) {
    const meta = episodeMeta(Number(un[1]));
    const price = meta?.price_coin ?? 300;
    if (wallet().coin < price) throw Object.assign(new Error(`코인이 ${price - wallet().coin}개 모자라요`), { status: 409, code: 'INSUFFICIENT_BALANCE' });
    addCoin(-price);
    line('EPISODE_UNLOCK', 'COIN', -price, ['episode', Number(un[1])]);
    unlocked.add(Number(un[1]));
    return { ok: true };
  }
  if (path === '/me/attendance') {
    const st = attendanceState();
    if (st.checked) throw Object.assign(new Error('오늘은 이미 출석했어요. 내일 또 만나요!'), { status: 409, code: 'ALREADY_ATTENDED' });
    const granted = st.today_coin;
    attended = true;
    addCoin(granted);
    line('ATTENDANCE', 'COIN', granted, undefined, '출석 체크');
    return { ...attendanceState(), granted };
  }
  if (path === '/wallet/coin/packages/buy') {
    const id = (body as { package_id?: string })?.package_id;
    const pk = ((F['/wallet/coin/packages'] ?? []) as { id: string; coin: number; bonus_coin: number; price: number }[]).find((x) => x.id === id);
    if (!pk) throw Object.assign(new Error('씨앗 묶음을 찾을 수 없어요'), { status: 404, code: 'PACKAGE_NOT_FOUND' });
    addCoin(pk.coin + pk.bonus_coin);
    line('COIN_CHARGE', 'COIN', pk.coin + pk.bonus_coin, undefined, `씨앗 묶음 (카드)`);
    return { package: pk, channel: 'PG', paid_amount: pk.price, lots: [], wallet: wallet() };
  }
  if (path === '/me/partner-points/convert') {
    const n = Number((body as { points?: number })?.points ?? 0);
    if (n <= 0 || n % 100) throw Object.assign(new Error('100P 단위로 바꿀 수 있어요'), { status: 400, code: 'BAD_POINTS' });
    if (n > points) throw Object.assign(new Error('키움 포인트가 모자라요'), { status: 400, code: 'NOT_ENOUGH_POINTS' });
    points -= n;
    addCoin(n);
    line('PARTNER_POINT', 'COIN', n, undefined, `키움 포인트 ${n.toLocaleString('ko-KR')}P`);
    return { broker: '키움증권', balance: points, converted: 3000 - points, unit: 100, rate: 1 };
  }
  if (path === '/me' && method === 'PATCH') {
    const me = { ...((local['/me'] ?? F['/me']) as Record<string, unknown>), ...(body as Record<string, unknown>) };
    local['/me'] = me;
    return clone(me);
  }
  if (path === '/me/risk-profile') {
    // 시연: 점수로 성향을 계산해 내 정보에 반영 (서버와 같은 기준)
    const answers = ((body as { answers?: number[] })?.answers ?? []);
    const me = { ...((local['/me'] ?? F['/me']) as Record<string, unknown>), risk_level: scoreToLevel(answers.reduce((a, b) => a + b, 0)), risk_checked_at: new Date().toISOString() };
    local['/me'] = me;
    return clone(me);
  }
  const sub = path.match(/^\/fundings\/(\d+)\/subscriptions(\/me)?$/);
  if (sub) return clone(subscribe(Number(sub[1]), method === 'DELETE' ? 0 : Number((body as { units?: number })?.units ?? 1)));
  if (path === '/dev/mock-kiwoom/subscribe') {
    // 키움 화면에서 결제: 토큰에 펀딩 번호가 들어 있다 (demo-<펀딩>)
    const b = (body ?? {}) as { token?: string; units?: number; new_account?: boolean };
    const fid = Number(String(b.token ?? '').replace('demo-', '')) || 1;
    const s2 = subscribe(fid, Number(b.units ?? 1));
    let coupon = 0;
    if (b.new_account && !kiwoomCoupon) { kiwoomCoupon = true; coupon = 20000; addCoin(coupon); line('PARTNER_COUPON', 'COIN', coupon, undefined, '키움증권 계좌 개설 쿠폰'); }
    return { subscription_id: s2.id, units: s2.units, link: { link_ref: 'kw_demo', coupon_coin: coupon } };
  }
  if (path === '/wallet/deposit/charge') {
    const n = Number((body as { amount?: number })?.amount ?? 0);
    setW((w) => { w.deposit_available += n; });
    line('DEPOSIT_IN', 'DEPOSIT', n, undefined, '키움증권 계좌에서 입금');
    return clone(wallet());
  }
  if (path === '/wallet/deposit/withdrawals') {
    const n = Number((body as { amount?: number })?.amount ?? 0);
    if (n > (wallet() as unknown as W).deposit_available) throw err(409, 'INSUFFICIENT_BALANCE', '출금할 수 있는 예치금보다 많아요');
    setW((w) => { w.deposit_available -= n; });
    line('WITHDRAWAL_OUT', 'DEPOSIT', -n, undefined, '키움증권 계좌로 출금');
    return { id: ++jid, amount: n, status: 'DONE', created_at: nowIso() };
  }
  if (path === '/wallet/coin/charge') {
    const n = Number((body as { amount?: number })?.amount ?? 0);
    addCoin(n); line('COIN_CHARGE', 'COIN', n);
    return clone(wallet());
  }
  const dib = path.match(/^\/works\/(\d+)\/dib$/);
  if (dib) {
    const k = `/works/${dib[1]}`;
    const w = clone((local[k] ?? F[k]) as { is_dibbed: boolean; dib_count: number });
    if (w) {
      const on = method === 'PUT';
      if (w.is_dibbed !== on) w.dib_count += on ? 1 : -1;
      w.is_dibbed = on;
      local[k] = w;
    }
    // 내 관심 작품 목록에도 반영 (MY · 관심 작품 · 쇼츠 하트가 같은 값을 보도록)
    const wid = Number(dib[1]);
    const mine = clone(((local['/me/dibs'] ?? F['/me/dibs']) ?? []) as { id: number }[]).filter((x) => x.id !== wid);
    if (method === 'PUT') {
      const card = ((F['/works?limit=100'] ?? []) as { id: number }[]).find((x) => x.id === wid) ?? (w as unknown as { id: number });
      if (card) mine.unshift({ ...card, id: wid });
    }
    local['/me/dibs'] = mine;
    return { ok: true };
  }
  if (path === '/fundings/' + path.split('/')[2] + '/broker-handoff') {
    return { channel: 'INTERNAL', broker: '키움증권', deeplink: 'kiwoom-mock://offering', token: `demo-${path.split('/')[2]}`, expires_at: new Date(Date.now() + 600000).toISOString(), linked: false };
  }
  if (path === '/market/orders') {
    const b = (body ?? {}) as { funding_id: number; side: string; price?: number; units: number; order_type?: string };
    if (b.order_type === 'MARKET') {
      // 시장가: 시연 데이터의 최우선 반대 호가에서 전량 체결된 것으로 보여 준다
      const ob = F[`/market/securities/${b.funding_id}/orderbook`] as { asks: { price: number }[]; bids: { price: number }[] } | undefined;
      const px = b.side === 'BUY' ? Math.min(...(ob?.asks ?? []).map((a) => a.price)) : Math.max(...(ob?.bids ?? []).map((x) => x.price));
      return { id: Date.now() % 100000, ...b, price: Number.isFinite(px) ? px : 1000, remaining_units: 0, status: 'FILLED', created_at: new Date().toISOString() };
    }
    return { id: Date.now() % 100000, ...b, remaining_units: b.units, status: 'OPEN', created_at: new Date().toISOString() };
  }
  return { ok: true };
}
