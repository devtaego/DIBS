// 증권 탭: ① 내 조각(보유·손익·주문 가능 예치금) ② 거래 중인 조각 ③ 곧 거래가 시작되는 작품(청약 마감 → 상장)
// 전체 자산은 홈, 돈 관리는 지갑에서. 여기서는 '조각을 사고파는 것'에만 집중한다.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import { Badge, Cover, DisclosureBar, DScreen, MarketCell, Panel, Section, Segmented, TopAppBar, Txt, color, spacing } from '@/ds';
import { api, type FundingCard, type Holding, type SecurityItem, type Wallet, type WorkCard } from '@/lib/api';
import { ddayText, manwon, signedPct, trendOf, typeLabel } from '@/lib/cards';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Sort = 'change' | 'latest' | 'price';
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

export default function Market() {
  const { me } = useSession();
  const [sort, setSort] = useState<Sort>('change');
  const { data, error, loading, reload } = useApi(async () => {
    const [list, works, holdings, wallet, open] = await Promise.all([
      api.get<SecurityItem[]>('/market/securities', { sort: sort === 'latest' ? 'latest' : 'change' }),
      api.get<WorkCard[]>('/works', { limit: 100 }),
      me ? api.get<Holding[]>('/me/holdings') : Promise.resolve([] as Holding[]),
      me ? api.get<Wallet>('/wallet') : Promise.resolve(null),
      api.get<FundingCard[]>('/fundings', { status: 'OPEN' }).catch(() => [] as FundingCard[]),
    ]);
    return { list, works, holdings, wallet, open };
  }, [sort, me?.id]);

  const workOf = useMemo(() => new Map((data?.works ?? []).map((w) => [w.id, w])), [data]);
  const held = useMemo(() => new Map((data?.holdings ?? []).map((h) => [h.funding_id, h])), [data]);
  const list = [...(data?.list ?? [])].sort((a, b) => (sort === 'price' ? (b.last_price ?? b.unit_price) - (a.last_price ?? a.unit_price) : 0));
  const holdAmt = (data?.holdings ?? []).reduce((a, h) => a + h.eval_amount, 0);
  const pnl = (data?.holdings ?? []).reduce((a, h) => a + h.pnl, 0);
  const soon = [...(data?.open ?? [])].sort((x, y) => (x.days_left ?? 99) - (y.days_left ?? 99)).slice(0, 3);

  return (
    <DScreen header={<TopAppBar type="Main" />} onRefresh={reload} tabBar gap={spacing.section}>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : null}

      {/* ① 내 조각 */}
      {data?.wallet ? (
        <Panel style={{ gap: spacing.gapL }}>
          <View style={{ gap: spacing.gapXs }}>
            <Txt v="label1" c={color.labelAlternative}>내 조각 평가금액</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.gapM }}>
              <Txt v="title1" w="bold" c={color.labelStrong} tabular>{won(holdAmt)}</Txt>
              {pnl ? <Txt v="label1" w="semibold" c={pnl > 0 ? color.rise : color.fall} tabular>{`${pnl > 0 ? '+' : '−'}${manwon(Math.abs(pnl))}`}</Txt> : null}
            </View>
          </View>
          {data.holdings.length ? data.holdings.map((h) => {
            const s = data.list.find((x) => x.funding_id === h.funding_id);
            const w = workOf.get(s?.work_id ?? -1);
            return (
              <Pressable key={h.funding_id} onPress={() => router.push(`/security/${h.funding_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapL }}>
                <View style={{ width: 40 }}><Cover id={w?.id ?? h.funding_id} title={h.work_title} url={w?.cover_url} size="Small" /></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="label1" w="semibold" c={color.labelStrong} lines={1}>{h.work_title}</Txt>
                  <Txt v="caption1" c={color.labelAlternative}>{`${h.units.toLocaleString('ko-KR')}조각 · 평균 ${h.avg_price.toLocaleString('ko-KR')}원`}</Txt>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Txt v="label1" w="bold" c={color.labelStrong} tabular>{won(h.eval_amount)}</Txt>
                  <Txt v="caption1" w="semibold" c={h.pnl >= 0 ? color.rise : color.fall} tabular>{signedPct(h.pnl_pct)}</Txt>
                </View>
              </Pressable>
            );
          }) : <Txt v="body2" c={color.labelAlternative}>아직 가진 조각이 없어요. 청약에 참여하면 상장 뒤 여기서 사고팔 수 있어요.</Txt>}
          <Pressable onPress={() => router.push('/wallet')} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.gapM, borderTopWidth: 1, borderTopColor: color.lineAlternative }}>
            <Txt v="label2" c={color.labelAlternative}>{`주문 가능 예치금 ${won(data.wallet.deposit_available)}`}</Txt>
            <Txt v="label2" w="semibold" c={color.labelNeutral}>지갑 ›</Txt>
          </Pressable>
        </Panel>
      ) : null}

      {/* ② 거래 중인 조각 */}
      <Section title="거래 중인 조각" count={`${list.length}종목`}>
        {list.length > 3 ? (
          <View style={{ marginBottom: spacing.gapM }}>
            <Segmented size="Small" value={sort} onChange={setSort} options={[{ key: 'change', label: '등락률' }, { key: 'latest', label: '최신 상장' }, { key: 'price', label: '가격' }]} />
          </View>
        ) : null}
        {list.map((x, i) => {
          const h = held.get(x.funding_id);
          return (
            <MarketCell
              key={x.funding_id}
              id={x.work_id}
              title={x.work_title}
              coverUrl={workOf.get(x.work_id)?.cover_url}
              meta={`${typeLabel(workOf.get(x.work_id)?.type ?? 'WEBTOON')} · 공모가 ${x.unit_price.toLocaleString('ko-KR')}원${h ? ` · 보유 ${h.units}조각` : ''}${x.status === 'SUSPENDED' ? ' · 거래 정지' : ''}`}
              price={(x.last_price ?? x.unit_price).toLocaleString('ko-KR')}
              change={signedPct(x.change_pct)}
              trend={trendOf(x.change_pct)}
              last={i === list.length - 1}
              onPress={() => router.push(`/security/${x.funding_id}`)}
            />
          );
        })}
        {data && !list.length ? <Txt v="body2" c={color.labelAlternative}>아직 거래 중인 조각이 없어요.</Txt> : null}
      </Section>

      {/* ③ 곧 거래가 시작돼요: 청약 마감 → 배정 → 약 1주 뒤 상장 */}
      {soon.length ? (
        <Section title="곧 거래가 시작돼요" count="청약 마감 후 약 1주">
          {soon.map((f, i) => {
            const w = workOf.get(f.work_id);
            return (
              <Pressable key={f.id} onPress={() => router.push(`/funding/${f.id}`)}
                style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, paddingVertical: spacing.insetM }, i > 0 && { borderTopWidth: 1, borderTopColor: color.lineAlternative }]}>
                <View style={{ width: 40 }}><Cover id={f.work_id} title={f.work_title} url={w?.cover_url} size="Small" /></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="label1" w="semibold" c={color.labelStrong} lines={1}>{f.work_title}</Txt>
                  <Txt v="caption1" c={color.labelAlternative}>{`청약 ${Math.round(f.progress.achievement_pct)}% 모임 · 1조각 ${f.unit_price.toLocaleString('ko-KR')}원`}</Txt>
                </View>
                <View style={{ alignSelf: 'center' }}><Badge type="Deadline" label={`마감 ${ddayText(f) || '임박'}`} /></View>
              </Pressable>
            );
          })}
        </Section>
      ) : null}

      <DisclosureBar text="원금 손실 가능 · 예금자 보호 대상 아님 · 가격제한폭 ±30%" />
    </DScreen>
  );
}

export const marketColor = color.rise;
