import { Card, Empty, ErrorBox, KV, Loading, Muted, Row, Screen, T, Badge } from '@/components/ui';
import { api, type DividendPayment } from '@/lib/api';
import { dateText, won } from '@/lib/format';
import { colors } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Dividends() {
  const { data, error, loading, reload } = useApi(() => api.get<DividendPayment[]>('/me/dividends'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const total = data?.filter((d) => d.status === 'PAID').reduce((a, d) => a + d.net, 0) ?? 0;
  return (
    <Screen onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      <Card style={{ backgroundColor: colors.cardAlt }}>
        <Muted>지금까지 받은 배당 (세후)</Muted>
        <T size={28} weight="700" color={colors.accent}>{won(total)}</T>
        <Muted>작품 순매출의 30%를 분기마다 보유 조각 수대로 나눠요 (작가 60% · DIBS 10%). 원천징수 15.4% 후 금액이에요.</Muted>
      </Card>
      {data?.length === 0 ? <Empty text="아직 받은 배당이 없어요" /> : null}
      {data?.map((d) => (
        <Card key={d.run_id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="700" style={{ flex: 1 }}>{d.work_title} · {d.period}</T>
            <Badge label={d.status === 'PAID' ? '지급 완료' : '지급 예정'} tone={d.status === 'PAID' ? 'accent' : 'default'} />
          </Row>
          <KV k="기준일 보유" v={`${d.units}조각`} />
          <KV k="세전 배당" v={won(d.gross)} />
          <KV k="원천징수 15.4%" v={`−${won(d.tax)}`} />
          <KV k="실입금" v={won(d.net)} vColor={colors.accent} />
          <Muted>지급일 {dateText(d.pay_date)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
