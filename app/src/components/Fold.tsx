import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Txt, color, spacing } from '@/ds';

/** open·onToggle 을 주면 바깥에서 여닫는다 (한 번에 하나만 열기) */
export function Fold({ title, sub, children, icon, last, open: openProp, onToggle }: {
  title: string; sub?: string; children: ReactNode; icon?: string; last?: boolean; open?: boolean; onToggle?: () => void;
}) {
  const [self, setSelf] = useState(false);
  const open = openProp ?? self;
  const toggle = onToggle ?? (() => setSelf((o) => !o));
  return (
    <View style={!last ? { borderBottomWidth: 1, borderBottomColor: color.lineAlternative } : undefined}>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapM, paddingVertical: spacing.insetL }}>
        {icon ? <Icon name={icon} size={20} c={color.labelNeutral} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="body2" w="medium" c={color.labelStrong}>{title}</Txt>
          {sub ? <Txt v="caption1" c={color.labelAlternative}>{sub}</Txt> : null}
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="chevD" size={18} c={color.labelAssistive} /></View>
      </Pressable>
      {open ? <View style={{ paddingBottom: spacing.insetL, gap: spacing.gapS }}>{children}</View> : null}
    </View>
  );
}
