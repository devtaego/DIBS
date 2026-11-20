// 정적 배포용 데모 모드 (EXPO_PUBLIC_DEMO=1).
// 서버 없이 돌아가도록, 시연 데이터베이스에서 미리 받아 둔 응답(demo-fixtures.json)으로 GET 을 답하고
// 쓰기 요청(청약·찜·주문 등)은 화면 흐름이 이어지도록 그럴듯한 응답을 돌려준다. 실제 저장은 하지 않는다.
import fixtures from './demo-fixtures.json';
import { scoreToLevel } from './risk';

type Query = Record<string, string | number | boolean | undefined | null> | undefined;
const F = fixtures as Record<string, unknown>;

const local: Record<string, unknown> = {};

export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

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
