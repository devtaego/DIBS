// 알림 설정: 받을 알림 종류를 켜고 끈다 (기기에 저장). 알림 목록은 상단바 종 아이콘에서.
import { Switch, View } from 'react-native';

import { MePage } from '@/components/MePage';
import { Callout, GroupLabel, Txt, color, spacing } from '@/ds';
import { usePref } from '@/lib/prefs';

const ITEMS: { key: string; title: string; sub: string; group: string }[] = [
  { key: 'deadline', title: '청약 마감 임박', sub: '청약했거나 찜한 펀딩이 마감 2일 전이 되면', group: '청약' },
  { key: 'open', title: '찜한 작품 공모 시작', sub: '공모 전 작품의 청약이 열리면', group: '청약' },
  { key: 'allocated', title: '배정 결과', sub: '청약 마감 후 몇 조각을 받았는지', group: '청약' },
  { key: 'listed', title: '상장 · 거래 체결', sub: '조각이 상장되거나 주문이 체결되면', group: '조각 마켓' },
  { key: 'dividend', title: '분기 정산', sub: '작품 수익이 정산되어 지급되면', group: '조각 마켓' },
  { key: 'episode', title: '새 회차', sub: '찜한 작품에 새 회차가 올라오면', group: '작품' },
  { key: 'marketing', title: '이벤트 · 혜택 (선택)', sub: '새 작품 소개와 이벤트 소식', group: '작품' },
];
const DEFAULT = Object.fromEntries(ITEMS.map((i) => [i.key, i.key !== 'marketing'])) as Record<string, boolean>;

export default function AlertSettings() {
  const [prefs, setPrefs] = usePref<Record<string, boolean>>('alerts', DEFAULT);
  const groups = [...new Set(ITEMS.map((i) => i.group))];
  return (
    <MePage title="알림 설정">
      {groups.map((g) => (
        <View key={g}>
          <GroupLabel>{g}</GroupLabel>
          {ITEMS.filter((i) => i.group === g).map((i) => (
            <View key={i.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapM, paddingVertical: spacing.insetM }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="body2" w="medium" c={color.labelStrong}>{i.title}</Txt>
                <Txt v="caption1" c={color.labelAlternative}>{i.sub}</Txt>
              </View>
              <Switch value={prefs[i.key] ?? DEFAULT[i.key]} onValueChange={(v) => setPrefs({ ...prefs, [i.key]: v })}
                trackColor={{ true: color.primaryNormal, false: color.lineNormal }} thumbColor="#fff" accessibilityLabel={i.title} />
            </View>
          ))}
        </View>
      ))}
      <Callout>투자 판단에 필요한 안내(배정 결과, 환불, 권리 변동)는 설정과 관계없이 보내 드려요.</Callout>
    </MePage>
  );
}
