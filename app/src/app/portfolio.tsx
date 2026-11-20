import { useLocalSearchParams } from 'expo-router';

import { PortfolioView } from '@/components/PortfolioView';

// 내 자산 · 내 펀딩. ?tab=subs 이면 청약·배정 탭부터 (청약 직후·MY '내 펀딩'에서)
export default function PortfolioScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <PortfolioView initialTab={tab === 'subs' ? 'subs' : tab === 'orders' ? 'orders' : 'holdings'} />;
}
