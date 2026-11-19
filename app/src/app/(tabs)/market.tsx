import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sparkline } from '@/components/charts';
import { Chip, DEmpty, MiniWork, SecH } from '@/components/dibby';
import { ErrorBox, Loading, Screen, T, changeColor } from '@/components/ui';
import { api, type Candle, type Holding, type SecurityItem, type Wallet } from '@/lib/api';
import { FUNDING_STATUS, pct, won } from '@/lib/format';
import { colors, radii, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

// 프로토타입 S.market: 예치금 카드 + 조각 마켓
export default function Securities() {
  const [sort, setSort] = useState<'change' | 'latest'>('change');
  const { data, error, loading, reload } = useApi(async () => {
    const [wallet, holdings, list] = await Promise.all([
      api.get<Wallet>('/wallet'),
      api.get<Holding[]>('/me/holdings'),
      api.get<SecurityItem[]>('/market/securities', { sort }),
    ]);
    const charts = await Promise.all(list.map((x) => api.get<Candle[]>(`/market/securities/${x.funding_id}/chart`, { days: 14 }).catch(() => [] as Candle[])));
    return { wallet, holdings, list, charts };
  }, [sort]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  const units = data?.holdings.reduce((a, h) => a + h.units, 0) ?? 0;
  const evalTotal = data?.holdings.reduce((a, h) => a + h.eval_amount, 0) ?? 0;

  return (
    <Screen onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      {data ? (
        <Pressable onPress={() => router.push('/portfolio')} style={s.inverse}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T size={12} weight="500" color={colors.bg} style={{ opacity: 0.7 }}>{data.wallet.mode === 'MOCK' ? '모의 예치금' : '예치금'}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T size={12} weight="600" color={colors.bg} style={{ opacity: 0.8 }}>내 자산</T>
              <Ionicons name="chevron-forward" size={14} color={colors.bg} style={{ opacity: 0.8 }} />
            </View>
          </View>
          <T size={28} weight="700" color={colors.bg} style={{ marginTop: 4 }}>{won(data.wallet.deposit_available)}</T>
          <T size={12} weight="500" color={colors.bg} style={{ opacity: 0.7, marginTop: 6 }}>
            보유 조각 {units.toLocaleString('ko-KR')}개 · 평가 {won(evalTotal)}
          </T>
        </Pressable>
      ) : null}

      <SecH title="조각 마켓" right={<Chip label="모의" tone="pink" />} />
      <View style={{ flexDirection: 'row', gap: space(2), marginBottom: space(3) }}>
        {([['change', '등락률 순'], ['latest', '최근 상장']] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setSort(k)} style={[s.sortChip, { backgroundColor: sort === k ? colors.labelStrong : colors.fillNormal }]}>
            <T size={13} weight="600" color={sort === k ? colors.bg : colors.labelNeutral}>{label}</T>
          </Pressable>
        ))}
      </View>

      {data && !data.list.length ? <DEmpty pose="peek" title="상장된 종목이 아직 없어요" text="펀딩이 끝나고 발행되면 여기서 거래할 수 있어요." /> : null}
      {data?.list.length ? (
        <View style={s.listCard}>
          {data.list.map((sec, i) => {
            const closes = data.charts[i].map((c) => c.close);
            const up = (sec.change_pct ?? 0) >= 0;
            return (
              <Pressable key={sec.funding_id} onPress={() => router.push(`/security/${sec.funding_id}`)} style={[s.li, i === data.list.length - 1 && { borderBottomWidth: 0 }]}>
                <MiniWork
                  id={sec.work_id}
                  title={sec.work_title}
                  line2={sec.status === 'LISTED' ? `공모가 ${won(sec.unit_price)}` : FUNDING_STATUS[sec.status]}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                      <Sparkline values={closes} up={up} />
                      <View style={{ alignItems: 'flex-end', minWidth: 72 }}>
                        <T size={14} weight="700">{won(sec.last_price)}</T>
                        <T size={12} weight="600" color={changeColor(sec.change_pct)}>{pct(sec.change_pct, 2)}</T>
                      </View>
                    </View>
                  }
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <T size={12} color={colors.labelAssistive} style={{ marginTop: space(3) }}>
        같은 가격끼리만 체결되는 지정가 거래예요. 가격제한폭은 기준가 ±30%. 실제 주문은 인가된 금융기관을 통해 이뤄지는 구조를 가정해요.
      </T>
    </Screen>
  );
}

const s = StyleSheet.create({
  inverse: { borderRadius: radii.card, backgroundColor: colors.labelStrong, padding: space(5) },
  sortChip: { paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radii.chip },
  listCard: { borderRadius: radii.card, backgroundColor: colors.card, paddingHorizontal: space(4) },
  li: { paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.line },
});
