import { router } from 'expo-router';

import { Card, Empty, ErrorBox, Loading, Muted, Screen, T } from '@/components/ui';
import { api, type Notification } from '@/lib/api';
import { dateText } from '@/lib/format';
import { colors } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Notifications() {
  const { data, error, loading, reload } = useApi(() => api.get<Notification[]>('/me/notifications', { limit: 50 }));

  const open = async (n: Notification) => {
    api.post(`/me/notifications/${n.id}/read`).catch(() => {});
    if (n.ref_type === 'funding' && n.ref_id) router.push(`/funding/${n.ref_id}`);
    else if (n.ref_type === 'dividend_run') router.push('/dividends');
  };

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 ? <Empty text="알림이 없어요" /> : null}
      {data?.map((n) => (
        <Card key={n.id} onPress={() => open(n)} style={!n.is_read ? { borderLeftWidth: 3, borderLeftColor: colors.accent } : undefined}>
          <T weight={n.is_read ? '400' : '700'}>{n.title}</T>
          {n.body ? <Muted>{n.body}</Muted> : null}
          <Muted size={12}>{dateText(n.created_at)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
