import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Txt, color, spacing } from '@/ds';

export function Fold({ title, sub, children, icon, last }: { title: string; sub?: string; children: ReactNode; icon?: string; last?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={!last ? { borderBottomWidth: 1, borderBottomColor: color.lineAlternative } : undefined}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
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
