// 정적 배포용 데모 모드 (EXPO_PUBLIC_DEMO=1).
// 서버 없이 돌아가도록, 시연 데이터베이스에서 미리 받아 둔 응답(demo-fixtures.json)으로 GET 을 답하고
// 쓰기 요청(청약·찜·주문 등)은 화면 흐름이 이어지도록 그럴듯한 응답을 돌려준다. 실제 저장은 하지 않는다.
import fixtures from './demo-fixtures.json';
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
const PAST = [true, true, false, true, true, true]; // 지난 6일 출석 기록 (오늘 출석하면 4일 연속)
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
function attendanceState() {
  const week = [...PAST, attended];
  let streak = 0;
  for (let i = week.length - 1; i >= 0; i--) { if (week[i]) streak++; else if (i === week.length - 1) continue; else break; }
  return { today: '2027-03-02', checked: attended, streak, week, coin: 100, bonus_days: 7, bonus: 300 };
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

export async function demoRequest(method: string, path: string, body?: unknown, query?: Query): Promise<unknown> {
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
  const un = path.match(/^\/episodes\/(\d+)\/unlock$/);
  if (un) {
    const meta = episodeMeta(Number(un[1]));
    const price = meta?.price_coin ?? 300;
    if (wallet().coin < price) throw Object.assign(new Error(`코인이 ${price - wallet().coin}개 모자라요`), { status: 409, code: 'INSUFFICIENT_BALANCE' });
    addCoin(-price);
    unlocked.add(Number(un[1]));
    return { ok: true };
  }
  if (path === '/me/attendance') {
    const st = attendanceState();
    if (st.checked) throw Object.assign(new Error('오늘은 이미 출석했어요. 내일 또 만나요!'), { status: 409, code: 'ALREADY_ATTENDED' });
    attended = true;
    const granted = 100 + ((st.streak + 1) % 7 === 0 ? 300 : 0);
    addCoin(granted);
    return { ...attendanceState(), granted };
  }
  if (path === '/me/partner-points/convert') {
    const n = Number((body as { points?: number })?.points ?? 0);
    if (n <= 0 || n % 100) throw Object.assign(new Error('100P 단위로 바꿀 수 있어요'), { status: 400, code: 'BAD_POINTS' });
    if (n > points) throw Object.assign(new Error('키움 포인트가 모자라요'), { status: 400, code: 'NOT_ENOUGH_POINTS' });
    points -= n;
    addCoin(n);
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
  if (sub) {
    const b = (body ?? {}) as { units?: number; reward_tier_id?: number | null };
    const s = { id: 9000 + Number(sub[1]), funding_id: Number(sub[1]), units: b.units ?? 1, status: 'ACTIVE', allocated_units: null, requested_tier_id: b.reward_tier_id ?? null, assigned_tier_id: null };
    local[`/fundings/${sub[1]}/subscriptions/me`] = s;
    return s;
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
    return { channel: 'INTERNAL', broker: '키움증권', deeplink: 'kiwoom-mock://offering', token: 'demo', expires_at: new Date(Date.now() + 600000).toISOString(), linked: false };
  }
  if (path === '/market/orders') {
    const b = (body ?? {}) as { funding_id: number; side: string; price: number; units: number };
    return { id: Date.now() % 100000, ...b, remaining_units: b.units, status: 'OPEN', created_at: new Date().toISOString() };
  }
  return { ok: true };
}
