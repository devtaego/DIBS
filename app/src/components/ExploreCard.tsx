import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Cover } from '@/components/dibby';
import { T } from '@/components/ui';
import { colors, radii, space } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// 디자인 ExploreCard: 2:3 표지 + 좌상단 지표 칩(모집% / 관심 / 상장) + 제목 + 장르 메타
export function ExploreCard({
  id,
  title,
  meta,
  stat,
  statIcon,
  coverUrl,
  isNew,
  rank,
  onPress,
}: {
  id: number;
  title: string;
  meta: string;
  stat: string;
  statIcon: IconName;
  coverUrl?: string | null;
  isNew?: boolean;
  rank?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
      <View style={s.cover}>
        <Cover id={id} title={title} genre={meta.split(' · ')[0]} coverUrl={coverUrl} style={StyleSheet.absoluteFill} />
        <View style={s.chips}>
          {rank ? (
            <View style={[s.tag, { backgroundColor: colors.labelStrong }]}>
              <T size={11} weight="700" color={colors.bg}>{rank}</T>
            </View>
          ) : null}
          {isNew ? (
            <View style={[s.tag, { backgroundColor: colors.primary }]}>
              <T size={11} weight="700" color={colors.onPrimary}>N</T>
            </View>
          ) : null}
          <View style={[s.tag, { backgroundColor: colors.dimmer, gap: 2, paddingRight: space(2) }]}>
            <Ionicons name={statIcon} size={12} color="#FFFFFF" />
            <T size={11} weight="600" color="#FFFFFF">{stat}</T>
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: space(1), gap: 2 }}>
        <T size={14} weight="700" numberOfLines={1}>{title}</T>
        <T size={12} weight="500" color={colors.labelAlternative} numberOfLines={1}>{meta}</T>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, gap: space(2) },
  cover: { width: '100%', aspectRatio: 2 / 3, borderRadius: radii.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  chips: { position: 'absolute', top: space(2), left: space(2), flexDirection: 'row', gap: space(1) },
  tag: { height: 20, minWidth: 20, paddingHorizontal: space(1), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radii.tag },
});
