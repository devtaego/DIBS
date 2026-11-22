import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Dibby } from '@/components/dibby';
import { MiniBars, weeklyText } from '@/components/ReaderCharts';
import { ErrorBox, Loading } from '@/components/ui';
import { CoverImg, Icon, PillRow, PINK, PINK_MUTED, TabHeader, Tag, Txt, V2Screen, color, wonText } from '@/ds';
import { api, type FundingCard, type WorkCard } from '@/lib/api';
import { useApi } from '@/lib/useApi';

// 06 펀딩 · 메인 (Screens – MVP v2)
// 장르 칩 + 펀딩 카드(표지 · 작가 · 한 줄 소개 · 달성률 · 금액 · 참여자 · 진행 막대)
const CHIPS: { label: string; keys: string[] }[] = [
  { label: '전체', keys: [] },
  { label: '일상·힐링', keys: ['일상', '힐링', '코미디'] },
  { label: '로맨스', keys: ['로맨스', '로판', '로맨틱'] },
  { label: '판타지', keys: ['판타지', '이세계'] },
  { label: '무협', keys: ['무협'] },
  { label: '스릴러', keys: ['스릴러', '미스터리', '추리'] },
  { label: '드라마', keys: ['드라마', '학원', '가족'] },
];

export default function FundingTab() {
  const [chip, setChip] = useState('전체');
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const { data, error, loading, reload } = useApi(async () => {
    const [list, works] = await Promise.all([api.get<FundingCard[]>('/fundings', { status: 'OPEN' }), api.get<WorkCard[]>('/works', { limit: 100 })]);
    return { list, works };
  }, []);
  const workById = useMemo(() => new Map((data?.works ?? []).map((w) => [w.id, w])), [data]);
  const chips = CHIPS.filter((c) => !c.keys.length || (data?.list ?? []).some((f) => c.keys.some((k) => (f.genre ?? '').includes(k))));
  const cur = CHIPS.find((c) => c.label === chip) ?? CHIPS[0];
  const list = (data?.list ?? []).filter((f) => !cur.keys.length || cur.keys.some((k) => (f.genre ?? '').includes(k)));

  const toggle = (f: FundingCard) => {
    const on = !(liked[f.work_id] ?? false);
    setLiked({ ...liked, [f.work_id]: on });
    (on ? api.put(`/works/${f.work_id}/dib`) : api.del(`/works/${f.work_id}/dib`)).catch(() => {});
  };

  return (
    <V2Screen header={<TabHeader title="펀딩" />} tabBar pad={0}>
      <View style={{ paddingTop: 4, paddingBottom: 16 }}>
        <PillRow items={chips.map((c) => c.label)} value={chip} onChange={setChip} />
      </View>
      <View style={{ paddingHorizontal: 20, gap: 20 }}>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Loading /> : null}
        {list.map((f) => (
          <FundCard key={f.id} f={f} cover={f.cover_url ?? workById.get(f.work_id)?.cover_url} liked={liked[f.work_id] ?? false} onLike={() => toggle(f)} />
        ))}
        {data && !list.length ? <Txt v="label1" c={color.labelAlternative} center style={{ paddingVertical: 40 }}>지금 모집 중인 펀딩이 없어요</Txt> : null}
      </View>
    </V2Screen>
  );
}

function FundCard({ f, cover, liked, onLike }: { f: FundingCard; cover?: string | null; liked: boolean; onLike: () => void }) {
  const pct = Math.round(f.progress.achievement_pct);
  const bar = Math.min(100, pct);
  const foot = pct >= 100 ? '달성 완료' : (f.days_left ?? 99) <= 3 ? '마감 임박 펀딩' : `목표 ${wonText(f.target_amount)}`;
  return (
    <Pressable onPress={() => router.push(`/funding/${f.id}`)} accessibilityRole="button" accessibilityLabel={`${f.work_title} 펀딩`}
      style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: color.elevatedNormal, borderWidth: 1, borderColor: color.lineAlternative,
        shadowColor: '#191F28', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}>
      <View style={{ height: 210 }}>
        <CoverImg id={f.work_id} url={cover} title={f.work_title} w="100%" h={210} r={0} shadow={false} />
        <View style={{ position: 'absolute', left: 12, top: 12, flexDirection: 'row', gap: 6 }}>
          <Tag label={f.work_type === 'WEBNOVEL' ? '웹소설' : '웹툰'} />
          {f.days_left != null ? <Tag label={f.days_left <= 0 ? '오늘 마감' : `D-${f.days_left}`} tone="dark" /> : null}
        </View>
        <Pressable onPress={onLike} accessibilityRole="button" accessibilityLabel={liked ? '찜 해제' : '찜'} hitSlop={6}
          style={{ position: 'absolute', right: 12, top: 12, width: 36, height: 36, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={liked ? 'heartF' : 'heart'} size={20} c={liked ? PINK : color.labelNormal} />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 10 }}>
        <View>
          {f.creator_nickname ? <Txt v="caption1" w="medium" c={color.labelAlternative} style={{ marginBottom: 4 }}>{f.creator_nickname}</Txt> : null}
          <Txt v="headline2" w="bold" c={color.labelStrong}>{f.work_title}</Txt>
        </View>
        {f.pitch ? (
          <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.elevatedAlternative }}>
            <Txt v="label2" c={color.labelNeutral} style={{ fontStyle: 'italic' }}>“{f.pitch}”</Txt>
          </View>
        ) : null}
        {f.readers_7d?.length ? <ReaderRow f={f} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Txt v="heading2" w="bold" c={PINK} tabular>{pct}%</Txt>
          <Txt v="label1" w="bold" c={color.labelStrong} tabular>{wonText(f.progress.raised_amount)}</Txt>
          <View style={{ flex: 1 }} />
          <Txt v="label2" w="medium" c={PINK_MUTED}>{f.progress.participants.toLocaleString('ko-KR')}명 펀딩</Txt>
        </View>
        <View style={{ marginTop: 26 }}>
          <View style={{ position: 'absolute', bottom: 6, left: `${bar}%`, marginLeft: -26 }} pointerEvents="none"><Dibby pose="run" size={38} /></View>
          <View style={{ height: 8, borderRadius: 999, backgroundColor: color.fillNormal, overflow: 'hidden' }}>
            <View style={{ width: `${bar}%`, height: '100%', borderRadius: 999, backgroundColor: PINK }} />
          </View>
        </View>
        <Txt v="caption1" w="semibold" c={PINK} style={{ textAlign: 'right', marginTop: -4 }}>{foot}</Txt>
      </View>
    </Pressable>
  );
}

// 카드 안 '최근 7일 독자' 한 줄: 미니 막대 + 주간 증가율. 공개한 지 얼마 안 된 작품은 '공개 N일째 · 비교 전'
function ReaderRow({ f }: { f: FundingCard }) {
  const days = f.readers_7d ?? [];
  const tracked = f.reader_tracked_days ?? 0;
  const weekly = weeklyText(f.reader_change_1w, tracked);
  const num = tracked > 14 && f.reader_change_1w != null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLabel={`최근 7일 독자, 주간 증가율 ${weekly}`}>
      <MiniBars values={days} />
      <View style={{ flex: 1 }}>
        <Txt v="caption1" w="semibold" c={color.labelNeutral}>
          {tracked ? `${tracked < 7 ? '지금까지' : '최근 7일'} 독자 ${(f.readers_last_7d ?? 0).toLocaleString('ko-KR')}명` : '아직 독자 데이터 없음'}
          {tracked && tracked < 7 ? ` · 공개 ${tracked}일째` : ''}
        </Txt>
      </View>
      <Txt v="caption1" w="bold" c={num ? ((f.reader_change_1w ?? 0) >= 0 ? color.rise : color.fall) : color.labelAlternative} tabular>주간 {weekly}</Txt>
    </View>
  );
}
