// 스택 화면 공통 상단바: 예전 화면(작품·회차·알림·주문 등)도 새 디자인 상단바(뒤로 · 제목 · 오른쪽 버튼)로 통일
import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopAppBar, color, spacing } from '@/ds';

type Props = { options: { title?: string; headerRight?: (p: { tintColor?: string; canGoBack: boolean }) => ReactNode } };

export function StackHeader({ options }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + (Platform.OS === 'web' ? 6 : 14), backgroundColor: color.bgNormal }}>
      <TopAppBar title={options.title ?? ''} />
      {options.headerRight ? (
        <View style={{ position: 'absolute', right: spacing.screen, bottom: 0, height: 56, justifyContent: 'center' }}>
          {options.headerRight({ canGoBack: true, tintColor: color.labelStrong })}
        </View>
      ) : null}
    </View>
  );
}
