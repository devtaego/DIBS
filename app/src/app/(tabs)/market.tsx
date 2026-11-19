import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Card, Empty, ErrorBox, Loading, Muted, Row, Screen, Segmented, T, changeColor } from '@/components/ui';
import { api, type SecurityItem } from '@/lib/api';
import { FUNDING_STATUS, pct, won } from '@/lib/format';
import { space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Market() {
  const [sort, setSort] = useState<'change' | 'latest'>('change');
  const { data, error, loading, reload } = useApi(() => api.get<SecurityItem[]>('/market/securities', { sort }), [sort]);

  return (
    <Screen onRefresh={reload}>
      <Segmented value={sort} onChange={setSort} options={[{ key: 'change', label: '등락률 순' }, { key: 'latest', label: '최근 상장' }]} />
      <Muted style={{ marginBottom: space(3) }}>같은 가격끼리만 체결되는 지정가 거래예요. 가격제한폭은 기준가 ±30%.</Muted>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? <Empty text="상장된 종목이 없어요" /> : null}
      {data?.map((sec) => (
        <Card key={sec.funding_id} onPress={() => router.push(`/security/${sec.funding_id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T weight="700" numberOfLines={1}>{sec.work_title}</T>
              <Row style={{ marginTop: 2 }}>
                <Muted>공모가 {won(sec.unit_price)}</Muted>
                {sec.status !== 'LISTED' ? <Badge label={FUNDING_STATUS[sec.status]} tone="danger" /> : null}
              </Row>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T size={17} weight="800">{won(sec.last_price)}</T>
              <T size={13} color={changeColor(sec.change_pct)}>{pct(sec.change_pct, 2)}</T>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
