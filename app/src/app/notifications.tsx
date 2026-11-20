// 알림: 안 읽은 알림은 분홍 점, 누르면 관련 화면으로
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Empty, ErrorBox, Loading, Screen } from '@/components/ui';
import { Icon, Txt, color, spacing } from '@/ds';
import { api, type Notification } from '@/lib/api';
import { dateText } from '@/lib/format';
import { useApi } from '@/lib/useApi';

const ICON: Record<string, string> = {
  DEADLINE_SOON: 'cClock', DIBBED_DEADLINE_SOON: 'cClock', DIBBED_FUNDING_OPEN: 'heart', ALLOCATED: 'checkC', LISTED: 'candle',
  PARTNER_COUPON: 'cGift', PARTNER_POINT: 'cGift', DIVIDEND_PAID: 'cCoin',
};

export default function Notifications() {
  const { data, error, loading, reload } = useApi(() => api.get<Notification[]>('/me/notifications', { limit: 50 }));

  const open = async (n: Notification) => {
    api.post(`/me/notifications/${n.id}/read`).catch(() => {});
    if (n.ref_type === 'funding' && n.ref_id) router.push(`/funding/${n.ref_id}`);
    else if (n.ref_type === 'dividend_run') router.push('/dividends');
    else if (n.type.startsWith('PARTNER')) router.push('/wallet');
  };

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 ? <Empty text="알림이 없어요" /> : null}
      {data?.map((n, i) => (
        <Pressable key={n.id} onPress={() => open(n)} accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', gap: spacing.gapL, paddingVertical: spacing.insetL, borderBottomWidth: i === data.length - 1 ? 0 : 1, borderBottomColor: color.lineAlternative }, pressed && { opacity: 0.6 }]}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.is_read ? color.bgAlternative : '#FDEBF1', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={ICON[n.type] ?? 'cBell'} size={20} c={n.is_read ? color.labelAlternative : color.primaryNormal} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt v="body2" w={n.is_read ? 'medium' : 'bold'} c={color.labelStrong}>{n.title}</Txt>
            {n.body ? <Txt v="label2" c={color.labelNeutral}>{n.body}</Txt> : null}
            <Txt v="caption1" c={color.labelAssistive}>{dateText(n.created_at)}</Txt>
          </View>
          {!n.is_read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.primaryNormal, marginTop: 6 }} /> : null}
        </Pressable>
      ))}
    </Screen>
  );
}
