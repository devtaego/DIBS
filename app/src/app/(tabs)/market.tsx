import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { PortfolioView } from '@/components/PortfolioView';
import { Badge, Card, Empty, ErrorBox, Loading, Muted, Row, Screen, Segmented, T, changeColor } from '@/components/ui';
import { api, type SecurityItem } from '@/lib/api';
import { FUNDING_STATUS, pct, won } from '@/lib/format';
import { colors, radii, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

type View_ = 'quotes' | 'assets';

// 증권 탭 = 시세(조각 마켓) + 내 자산
export default function Securities() {
  const [view, setView] = useState<View_>('quotes');
  const header = <Segmented value={view} onChange={setView} options={[{ key: 'quotes', label: '시세' }, { key: 'assets', label: '내 자산' }]} />;
  return view === 'quotes' ? <Quotes header={header} /> : <PortfolioView header={header} />;
}

function Quotes({ header }: { header: ReactNode }) {
  const [sort, setSort] = useState<'change' | 'latest'>('change');
  const { data, error, loading, reload } = useApi(() => api.get<SecurityItem[]>('/market/securities', { sort }), [sort]);

  return (
    <Screen onRefresh={reload}>
      {header}
      <Row style={{ gap: space(2), marginBottom: space(3) }}>
        {([['change', '등락률 순'], ['latest', '최근 상장']] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setSort(k)} style={{ paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radii.chip, backgroundColor: sort === k ? colors.labelStrong : colors.fillNormal }}>
            <T size={13} weight="600" color={sort === k ? colors.bg : colors.labelNeutral}>{label}</T>
          </Pressable>
        ))}
      </Row>
      <Muted style={{ marginBottom: space(3) }}>같은 가격끼리만 체결되는 지정가 거래예요. 가격제한폭은 기준가 ±30%.</Muted>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? <Empty text="상장된 종목이 없어요" /> : null}
      {data?.map((sec) => (
        <Card key={sec.funding_id} onPress={() => router.push(`/security/${sec.funding_id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T weight="600" numberOfLines={1}>{sec.work_title}</T>
              <Row style={{ marginTop: 2 }}>
                <Muted>공모가 {won(sec.unit_price)}</Muted>
                {sec.status !== 'LISTED' ? <Badge label={FUNDING_STATUS[sec.status]} tone="danger" /> : null}
              </Row>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T size={17} weight="700">{won(sec.last_price)}</T>
              <T size={13} weight="600" color={changeColor(sec.change_pct)}>{pct(sec.change_pct, 2)}</T>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
