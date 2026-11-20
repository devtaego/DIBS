// MY 하위 화면 공통 틀: 스택 헤더 대신 DS 상단바.
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { DScreen, TopAppBar, spacing } from '@/ds';

export function MePage({ title, children, footer, onRefresh }: { title: string; children: ReactNode; footer?: ReactNode; onRefresh?: () => Promise<unknown> }) {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DScreen header={<TopAppBar title={title} />} footer={footer} onRefresh={onRefresh} gap={spacing.gapXl}>{children}</DScreen>
    </>
  );
}

/** 접었다 펴는 줄 (FAQ·약관·서류함) */
export { Fold } from './Fold';
