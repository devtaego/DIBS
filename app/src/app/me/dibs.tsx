// 관심 작품(찜) 목록: 공모 단계별로 묶어서 보여 준다. 찜한 작품은 공모 시작·마감 임박 알림을 받는다.
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { MePage } from '@/components/MePage';
import { ErrorBox } from '@/components/ui';
import { Badge, Cover, Empty, Txt, color, spacing } from '@/ds';
import { api, type WorkCard } from '@/lib/api';
import { PHASE_LABEL, phaseOf, type Phase } from '@/lib/phase';
import { useApi } from '@/lib/useApi';

const ORDER: Phase[] = ['OPEN', 'PRE', 'CLOSED'];
const HINT: Record<Phase, string> = { OPEN: '지금 청약할 수 있어요', PRE: '공모가 열리면 알려 드려요', CLOSED: '조각 마켓에서 거래돼요' };

export default function MyDibs() {
  const { data, error, reload } = useApi(async () => {
    const [dibs, works] = await Promise.all([api.get<WorkCard[]>('/me/dibs'), api.get<WorkCard[]>('/works', { limit: 100 })]);
    const byId = new Map(works.map((w) => [w.id, w]));
    return dibs.map((d) => ({ ...d, ...(byId.get(d.id) ?? {}) }) as WorkCard);
  });
  return (
    <MePage title="관심 작품" onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.length ? <Empty title="찜한 작품이 없어요" text="작품 페이지에서 하트를 눌러 보세요" /> : null}
      {ORDER.map((p) => {
        const list = (data ?? []).filter((w) => phaseOf(w.funding_status) === p);
        if (!list.length) return null;
        return (
          <View key={p} style={{ gap: spacing.gapM }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapS }}>
              <Txt v="headline2" w="bold" c={color.labelStrong}>{PHASE_LABEL[p]}</Txt>
              <Txt v="label2" c={color.labelAlternative}>{list.length}</Txt>
              <Txt v="caption1" c={color.labelAssistive} style={{ marginLeft: 'auto' }}>{HINT[p]}</Txt>
            </View>
            {list.map((w) => (
              <Pressable key={w.id} onPress={() => router.push(`/work/${w.id}`)} style={{ flexDirection: 'row', gap: spacing.gapL, alignItems: 'center' }}>
                <View style={{ width: 56 }}><Cover id={w.id} title={w.title} url={w.cover_url} size="Small" /></View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt v="body2" w="semibold" c={color.labelStrong} lines={1}>{w.title}</Txt>
                  <Txt v="caption1" c={color.labelAlternative}>{`${w.type === 'WEBNOVEL' ? '웹소설' : '웹툰'} · ${w.genre}`}</Txt>
                </View>
                <View style={{ alignSelf: 'center' }}><Badge label={PHASE_LABEL[p]} type={p === 'OPEN' ? 'Recruiting' : p === 'CLOSED' ? 'Trading' : 'Neutral'} /></View>
              </Pressable>
            ))}
          </View>
        );
      })}
    </MePage>
  );
}
