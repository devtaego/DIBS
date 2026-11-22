import { View } from 'react-native';

import { BigBtn, Sheet, Txt, color } from '@/ds';

// 결제·사용 전에 무엇을 얼마에 하는지 한 번 더 보여 주는 바텀시트 (씨앗 구매, 회차 열기, 포인트 전환)
export type ConfirmRow = { label: string; value: string; strong?: boolean };

export function ConfirmSheet({ visible, onClose, title, rows, note, confirmLabel, onConfirm, busy, disabled }: {
  visible: boolean; onClose: () => void; title: string; rows: ConfirmRow[]; note?: string;
  confirmLabel: string; onConfirm: () => void; busy?: boolean; disabled?: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={busy ? () => {} : onClose} title={title}>
      <View style={{ marginTop: 4, marginHorizontal: 4 }}>
        {rows.map((r, i) => (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12,
            borderTopWidth: r.strong && i > 0 ? 1 : 0, borderTopColor: color.lineAlternative }}>
            <Txt v={r.strong ? 'body1' : 'label1'} w={r.strong ? 'bold' : 'medium'} c={r.strong ? color.labelStrong : color.labelAlternative}>{r.label}</Txt>
            <Txt v={r.strong ? 'headline1' : 'label1'} w={r.strong ? 'bold' : 'semibold'} c={color.labelStrong} tabular>{r.value}</Txt>
          </View>
        ))}
        {note ? <Txt v="caption1" w="medium" c={color.labelAssistive} style={{ marginTop: 8 }}>{note}</Txt> : null}
      </View>
      <View style={{ gap: 4, marginTop: 20 }}>
        <BigBtn label={busy ? '처리하는 중…' : confirmLabel} onPress={onConfirm} disabled={busy || disabled} h={52} />
        <BigBtn label="취소" tone="line" onPress={onClose} disabled={busy} h={44} />
      </View>
    </Sheet>
  );
}
