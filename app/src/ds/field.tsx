import { useState } from 'react';
import { TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { Txt } from './base';
import { color, textStyle } from './tokens';

/** Textfield (라벨 + 입력칸 + 도움말). status: Negative 빨강 · Positive 초록 */
export function Field({ label, value, onChangeText, placeholder, keyboardType, help, status, maxLength, autoFocus, secure }: {
  label?: string; value: string; onChangeText: (t: string) => void; placeholder?: string; keyboardType?: KeyboardTypeOptions;
  help?: string; status?: 'Negative' | 'Positive'; maxLength?: number; autoFocus?: boolean; secure?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const line = status === 'Negative' ? color.negative : status === 'Positive' ? color.positive : focus ? color.labelStrong : color.lineNeutral;
  return (
    <View style={{ gap: 8 }}>
      {label ? <Txt v="label1" w="semibold" c={color.labelNeutral}>{label}</Txt> : null}
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={color.labelAssistive}
        keyboardType={keyboardType} maxLength={maxLength} autoFocus={autoFocus} secureTextEntry={secure}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} accessibilityLabel={label}
        style={[textStyle('body1', 'medium'), { height: 52, borderRadius: 12, borderWidth: focus || status ? 2 : 1, borderColor: line, paddingHorizontal: 16, color: color.labelStrong, backgroundColor: color.bgNormal }]}
      />
      {help ? <Txt v="caption1" w="medium" c={status === 'Negative' ? color.negative : status === 'Positive' ? color.positive : color.labelAlternative}>{help}</Txt> : null}
    </View>
  );
}

export const formatPhone = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
};
export const validPhone = (t: string) => /^01\d{8,9}$/.test(t.replace(/\D/g, ''));
