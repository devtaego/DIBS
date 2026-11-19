import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dibby, type Pose } from '@/components/dibby';
import { Button, T } from '@/components/ui';
import { colors, radii, space, type as ts } from '@/lib/theme';

// 청약·주문 완료 화면 (프로토타입 S.done)
export type DoneParams = {
  pose: Pose;
  tag: string;
  title: string;
  sub: string;
  rows: string; // JSON [[라벨, 값], ...]
  note?: string;
  aLabel: string;
  aHref: string;
  bLabel?: string;
  bHref?: string;
};

export default function Done() {
  const p = useLocalSearchParams<DoneParams>();
  let rows: [string, string][] = [];
  try {
    rows = JSON.parse(p.rows ?? '[]');
  } catch {
    rows = [];
  }
  const go = (href?: string) => router.replace((href || '/') as Href);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space(2) }}>
        <Pressable accessibilityLabel="닫기" onPress={() => go(p.aHref)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={24} color={colors.labelStrong} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24, paddingBottom: 40 }}>
        <View style={s.halo} />
        <Dibby pose={(p.pose as Pose) || 'done'} size={138} style={{ marginTop: space(2) }} />
        <View style={s.tag}>
          <T size={12} weight="700" color={colors.highlight}>{p.tag}</T>
        </View>
        <T size={ts.title3.fontSize} weight="700" style={{ marginTop: space(3), textAlign: 'center' }}>{p.title}</T>
        <T size={14} color={colors.labelNeutral} style={{ marginTop: space(2), textAlign: 'center' }}>{p.sub}</T>

        <View style={s.rcpt}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[s.li, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <T size={13} weight="500" color={colors.labelAlternative}>{k}</T>
              <T size={i === rows.length - 1 ? 17 : 13} weight="700" color={i === rows.length - 1 ? colors.primary : colors.labelStrong}>{v}</T>
            </View>
          ))}
        </View>
        {p.note ? <T size={12} color={colors.labelAssistive} style={{ marginTop: space(3), textAlign: 'center' }}>{p.note}</T> : null}

        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: space(6) }}>
          {p.bLabel ? <Button title={p.bLabel} kind="ghost" onPress={() => go(p.bHref)} style={{ flex: 1 }} /> : null}
          <Button title={p.aLabel || '확인'} onPress={() => go(p.aHref)} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  halo: { position: 'absolute', top: 0, width: 220, height: 220, borderRadius: 110, backgroundColor: colors.highlightFill },
  tag: { marginTop: space(3), height: 24, paddingHorizontal: 10, borderRadius: radii.chip, backgroundColor: colors.highlightFill, justifyContent: 'center' },
  rcpt: { alignSelf: 'stretch', marginTop: space(6), borderRadius: radii.card, backgroundColor: colors.card, paddingHorizontal: space(4) },
  li: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space(3.5), borderBottomWidth: 1, borderBottomColor: colors.line },
});
