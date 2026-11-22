import type React from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dibby } from '@/components/dibby';
import { DailyReadersChart, EpisodeFunnelChart, weeklyText } from '@/components/ReaderCharts';
import { ErrorBox, Loading } from '@/components/ui';
import { CoverImg, HeadBtn, Icon, PINK, Tag, Txt, color, wonText } from '@/ds';
import { api, track, type Creator, type Disclosure, type Episode, type FundingDetail, type Indicators, type ReaderTrend, type Serial, type Subscription, type WorkDetail } from '@/lib/api';
import { dateText } from '@/lib/format';
import { nowMs } from '@/lib/now';
import { shareWork } from '@/lib/share';
import { useApi } from '@/lib/useApi';

// 04 펀딩 · 상세 (Screens – MVP v2): 소개 · 작품 · 작가 이야기 · 펀딩 계획
type Tab = '소개' | '작품' | '작가 이야기' | '펀딩 계획';
const TABS: Tab[] = ['소개', '작품', '작가 이야기', '펀딩 계획'];
const SOFT = '#FFF6F9';
const SOFT_LINE = '#F6D6E2';

export default function FundingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('소개');
  const [note, setNote] = useState('');
  const { data, error, loading, reload } = useApi(async () => {
    const [f, ind, disc, ser] = await Promise.all([
      api.get<FundingDetail>(`/fundings/${id}`),
      api.get<Indicators>(`/fundings/${id}/indicators`).catch(() => null),
      api.get<Disclosure>(`/fundings/${id}/disclosure`).catch(() => null),
      api.get<Serial>(`/fundings/${id}/serial`).catch(() => null),
    ]);
    const [work, eps, trend] = await Promise.all([api.get<WorkDetail>(`/works/${f.work_id}`), api.get<Episode[]>(`/works/${f.work_id}/episodes`),
      api.get<ReaderTrend>(`/works/${f.work_id}/reader-trend`).catch(() => null)]);
    const creator = await api.get<Creator>(`/creators/${work.creator_id}`).catch(() => null);
    const sub = await api.get<Subscription | null>(`/fundings/${id}/subscriptions/me`).catch(() => null);
    return { f, ind, disc, ser, work, eps, creator, sub, trend };
  }, [id], 30_000);
  useEffect(() => track('FUNDING_VIEW', { funding_id: Number(id) }), [id]);

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: color.bgNormal }}>
        <Stack.Screen options={{ headerShown: false }} />
        {loading ? <Loading /> : <ErrorBox error={error} onRetry={reload} />}
      </SafeAreaView>
    );
  }
  const { f, ind, disc, ser, work, eps, creator, sub, trend } = data;
  // 주간 독자 증가율: 공개 2주가 안 되면 직전 7일이 다 차지 않아 '비교 전'으로 (값은 데이터팀 정의 그대로 받음)
  const tracked = trend?.tracked_days ?? (work.reader_change_1w != null ? 15 : 0);
  const change = trend ? trend.reader_change_1w : work.reader_change_1w;
  const weekly = weeklyText(change, tracked);
  const weeklyNum = tracked > 14 && change != null;
  const weeklyDesc = !tracked ? '아직 회차를 본 독자가 없어요.'
    : tracked <= 14 ? `파일럿 공개 ${tracked}일째예요. 직전 7일이 다 쌓이는 공개 2주 뒤부터 주간 증가율을 보여 줘요.${trend ? ` ${tracked < 7 ? '지금까지' : '최근 7일'} 순독자 ${trend.readers_last_7d.toLocaleString('ko-KR')}명.` : ''}`
    : `직전 7일 대비 최근 7일 동안 회차를 본 순독자 수의 변화율이에요.${trend ? ` 최근 7일 ${trend.readers_last_7d.toLocaleString('ko-KR')}명 · 직전 7일 ${trend.readers_prev_7d.toLocaleString('ko-KR')}명.` : ''}`;
  const open = f.status === 'OPEN';
  const listed = f.status === 'LISTED' || f.status === 'SUSPENDED';
  const pct = Math.round(f.progress.achievement_pct);
  const bar = Math.min(100, pct);
  const left = f.days_left ?? (f.close_at ? Math.max(0, Math.ceil((Date.parse(`${f.close_at}+09:00`) - nowMs()) / 86_400_000)) : null);
  const dday = open ? (left == null ? '모집 중' : left <= 0 ? '오늘 마감' : `D-${left}`) : listed ? '상장' : f.status === 'APPROVED' ? '오픈 예정' : '모집 마감';

  const cta = listed
    ? { label: 'IP토큰 시세 보기', go: () => router.push(`/security/${f.id}`) }
    : sub?.status === 'ACTIVE'
      ? { label: `${wonText(sub.units * f.unit_price)} 펀딩 중 · 금액 바꾸기`, go: () => router.push(`/subscribe/${f.id}`) }
      : { label: open ? '펀딩하기' : '모집이 끝났어요', go: () => router.push(`/subscribe/${f.id}`) };

  return (
    <View style={{ flex: 1, backgroundColor: color.bgNormal }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }} stickyHeaderIndices={[2]}>
        <View style={{ height: 210 }}>
          <CoverImg id={f.work_id} url={work.cover_url} title={f.work_title} w="100%" h={210} r={0} shadow={false} />
          <LinearGradient colors={['rgba(10,8,14,0.5)', 'rgba(10,8,14,0)', 'rgba(10,8,14,0.35)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={['top']} style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
            <View style={{ height: 52, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, alignItems: 'center' }}>
              <HeadBtn icon="back" label="뒤로" c={color.white} onPress={() => (router.canGoBack() ? router.back() : router.replace('/funding'))} />
              <HeadBtn icon="share" label="공유" c={color.white} onPress={async () => { const m = await shareWork(work.id, work.title); if (m) { setNote(m); setTimeout(() => setNote(''), 1800); } }} />
            </View>
          </SafeAreaView>
          <View style={{ position: 'absolute', left: 20, bottom: 14, flexDirection: 'row', gap: 6 }}>
            <Tag label={work.type === 'WEBNOVEL' ? '웹소설' : '웹툰'} />
            <Tag label={dday} tone="dark" />
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 16, gap: 8 }}>
          {creator ? <Txt v="caption1" w="medium" c={color.labelAlternative}>{creator.nickname}</Txt> : null}
          <Txt v="headline1" w="bold" c={color.labelStrong}>{f.work_title}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Txt v="heading1" w="bold" c={PINK} tabular>{pct}%</Txt>
            <Txt v="body2" w="bold" c={color.labelStrong} tabular>{wonText(f.progress.raised_amount)}</Txt>
            <View style={{ flex: 1 }} />
            <Txt v="caption1" w="medium" c={color.labelAlternative}>{f.progress.participants.toLocaleString('ko-KR')}명 펀딩</Txt>
          </View>
          <View style={{ marginTop: 30 }}>
            <View pointerEvents="none" style={{ position: 'absolute', bottom: 4, left: `${bar}%`, marginLeft: -24 }}><Dibby pose="run" size={40} /></View>
            <View style={{ height: 6, borderRadius: 999, backgroundColor: color.fillNormal, overflow: 'hidden' }}>
              <View style={{ width: `${bar}%`, height: '100%', borderRadius: 999, backgroundColor: PINK }} />
            </View>
          </View>
          <Txt v="caption1" c={color.labelAssistive}>목표 {wonText(f.target_amount)} · 1조각 {f.unit_price.toLocaleString('ko-KR')}원</Txt>
        </View>

        <View style={{ backgroundColor: color.bgNormal }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 20, height: 46, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.lineAlternative }} accessibilityRole="tablist">
            {TABS.map((t, i) => (
              <View key={t} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                {i ? <View style={{ width: 1, height: 12, backgroundColor: color.lineNeutral }} /> : null}
                <Pressable onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: t === tab }} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="label1" w="bold" c={t === tab ? color.labelStrong : color.labelAssistive}>{t}</Txt>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        {tab === '소개' ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#FDEBF1', justifyContent: 'center' }}><Txt v="caption1" w="bold" c={PINK}>상장 전</Txt></View>
              <Txt v="body1" w="bold" c={color.labelStrong}>미리보기 반응 지표</Txt>
            </View>
            <Metric title="1화 → 3화 연독률" value={ind?.pilot_read_through != null ? `${Math.round(ind.pilot_read_through * 100)}%` : '-'}
              desc="1화를 끝까지 본 독자 중 공개된 마지막 무료 회차까지 본 비율이에요. 막대는 회차별로 끝까지 본 독자예요.">
              {trend?.episode_funnel.length ? <EpisodeFunnelChart funnel={trend.episode_funnel} /> : ind?.pilot_read_through != null ? (
                <View style={{ height: 8, marginTop: 10, marginBottom: 6, borderRadius: 999, backgroundColor: color.fillNormal, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(ind.pilot_read_through * 100)}%`, height: '100%', borderRadius: 999, backgroundColor: PINK }} />
                </View>
              ) : null}
            </Metric>
            <Metric title="주간 독자 증가율" value={weekly}
              vc={weeklyNum ? ((change ?? 0) >= 0 ? color.rise : color.fall) : color.labelAlternative} desc={weeklyDesc}>
              {trend ? <DailyReadersChart days={trend.days} /> : null}
            </Metric>
            {ind ? (
              <Metric title="관심 등록" value={`${ind.dibs_total.toLocaleString('ko-KR')}명`} desc={`최근 7일 ${ind.dibs_7d.toLocaleString('ko-KR')}명이 새로 찜했어요. 최근 4주 열람자 ${ind.pilot_readers_4w.toLocaleString('ko-KR')}명.`} />
            ) : null}
            <Txt v="caption2" w="medium" c={color.labelAssistive} style={{ marginTop: 10, marginHorizontal: 2 }}>상장 후에는 종목 상세에서 배당·거래 지표로 이어서 볼 수 있어요.</Txt>
          </View>
        ) : null}

        {tab === '작품' ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 18, gap: 10 }}>
            <Txt v="body2" c={color.labelNeutral}>{work.synopsis}</Txt>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
              <Txt v="label1" w="bold" c={color.labelStrong}>미리보기 {Math.min(3, eps.length)}화</Txt>
              <Txt v="caption1" w="medium" c={color.labelAssistive}>무료 공개</Txt>
            </View>
            {eps.slice(0, 3).map((ep, i) => (
              <Pressable key={ep.id} onPress={() => router.push(`/episode/${ep.id}`)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14, backgroundColor: color.elevatedAlternative }}>
                <CoverImg id={work.id} url={work.cover_url} w={76} h={54} r={10} shadow={false} />
                <View style={{ flex: 1 }}>
                  <Txt v="caption1" w="bold" c={PINK}>{ep.no}화</Txt>
                  <Txt v="label1" w="semibold" c={color.labelStrong} lines={1}>{ep.title === `${ep.no}화` ? `${work.title} ${i + 1}화` : ep.title}</Txt>
                </View>
                <View style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.white, borderWidth: 1, borderColor: color.lineNormal, justifyContent: 'center' }}>
                  <Txt v="caption1" w="bold" c={color.labelStrong}>보기</Txt>
                </View>
              </Pressable>
            ))}
            <View style={{ padding: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: SOFT, borderWidth: 1, borderColor: SOFT_LINE, flexDirection: 'row', gap: 10 }}>
              <Icon name="lock" size={18} c={PINK} />
              <Txt v="caption1" w="medium" c="#8C2550" style={{ flex: 1 }}>
                <Txt v="caption1" w="bold" c="#8C2550">4화부터는 펀딩 성공 후 연재돼요.</Txt> 작품이 IP토큰으로 상장되면 펀딩한 금액만큼 조각을 받고, 상장 뒤 미리보기는 씨앗으로 먼저 볼 수 있어요.
              </Txt>
            </View>
            {f.reward_tiers.length ? (
              <View style={{ gap: 6, marginTop: 6 }}>
                <Txt v="label1" w="bold" c={color.labelStrong}>함께 받는 리워드</Txt>
                {f.reward_tiers.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <Txt v="label2" c={color.labelNeutral} style={{ flex: 1 }}>{r.title}</Txt>
                    <Txt v="label2" w="semibold" c={color.labelStrong}>{r.min_units.toLocaleString('ko-KR')}조각부터</Txt>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === '작가 이야기' ? (
          <View style={{ paddingTop: 18 }}>
            <View style={{ marginHorizontal: 20, padding: 18, paddingBottom: 16, borderRadius: 20, backgroundColor: SOFT, borderWidth: 1, borderColor: SOFT_LINE }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 999, backgroundColor: '#FBD9E3', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="label1" w="bold" c={PINK}>{(creator?.nickname ?? '작').slice(0, 1)}</Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="label1" w="bold" c={color.labelStrong}>{creator?.nickname ?? '작가'} 작가의 편지</Txt>
                  <Txt v="caption1" w="medium" c={color.labelAssistive}>작품 {creator?.works.length ?? 1}개 연재</Txt>
                </View>
              </View>
              <Txt v="label2" c={color.labelNeutral} style={{ lineHeight: 21 }}>{creator?.bio || '작가 소개가 아직 없어요.'}</Txt>
              {f.use_of_funds ? <Txt v="label2" c={color.labelNeutral} style={{ marginTop: 8, lineHeight: 21 }}>모인 돈은 {f.use_of_funds}에 쓸 계획이에요.</Txt> : null}
            </View>
            {ser ? (
              <View style={{ marginHorizontal: 20, marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: '#FFF9EC', flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Dibby pose="careful" size={40} />
                <Txt v="label2" w="medium" c="#6B4A12" style={{ flex: 1 }}>
                  시즌 {ser.committed_episodes}화를 한 달 {ser.monthly_quota}화씩 연재하기로 약속했어요. 연재가 석 달치 밀리면 남은 제작비와 유보금이 투자자에게 돌아가요.
                </Txt>
              </View>
            ) : null}
            {creator && creator.works.length > 1 ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
                <Txt v="label1" w="bold" c={color.labelStrong} style={{ marginBottom: 10 }}>{creator.nickname}의 다른 작품</Txt>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {creator.works.filter((w) => w.id !== work.id).slice(0, 8).map((w) => (
                    <Pressable key={w.id} onPress={() => router.push(`/work/${w.id}`)} style={{ width: 96 }}>
                      <CoverImg id={w.id} url={w.cover_url} title={w.title} w={96} h={144} r={10} />
                      <Txt v="caption1" w="semibold" c={color.labelStrong} lines={1} style={{ marginTop: 6 }}>{w.title}</Txt>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === '펀딩 계획' ? (
          <View style={{ paddingTop: 18 }}>
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24 }}>
              {[
                [`${ser?.committed_episodes ?? 40}화`, '연재 약정'],
                [`${(ind?.dibs_total ?? work.dib_count).toLocaleString('ko-KR')}`, '관심 등록'],
                [`${f.per_user_cap_units.toLocaleString('ko-KR')}조각`, '1인 한도'],
                [`${f.progress.participants}명`, '참여'],
              ].map(([v, k]) => (
                <View key={k} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, backgroundColor: color.elevatedAlternative, alignItems: 'center' }}>
                  <Txt v="body1" w="bold" c={color.labelStrong}>{v}</Txt>
                  <Txt v="caption2" w="medium" c={color.labelAlternative}>{k}</Txt>
                </View>
              ))}
            </View>
            <View style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18, backgroundColor: '#FCE9F0', borderWidth: 1, borderColor: '#F3D3E0', overflow: 'hidden' }}>
              <View style={{ position: 'absolute', right: 10, top: 6 }}><Dibby pose="dibs" size={46} /></View>
              <Txt v="caption1" w="bold" c={PINK}>10,000원 펀딩하면</Txt>
              <Txt v="heading2" w="bold" c="#2A1620" style={{ marginVertical: 2 }}>상장되면 IP토큰 {Math.floor(10000 / f.unit_price)}조각</Txt>
              <Txt v="caption1" w="medium" c="#9C3F66">분기마다 작품 매출의 {(f.terms.royalty_holder_bps / 100).toFixed(0)}%를 조각 수만큼 나눠 받아요 · 수익은 보장되지 않아요</Txt>
            </View>
            <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
              {[
                [`펀딩 마감 · ${dateText(f.close_at) || '-'}`, '목표에 못 미치면 묶인 금액을 모두 돌려드려요'],
                ['배정 · 발행', '신청이 몰리면 20%는 똑같이(추첨), 80%는 신청 수량대로 나눠요'],
                ['IP토큰 상장', `키움증권 계좌로 조각이 들어오고 마켓에서 사고팔 수 있어요`],
                ['분기마다 배당금', `매출의 ${(f.terms.royalty_holder_bps / 100).toFixed(0)}%를 조각 보유자가 나눠요 (세금 15.4% 뗀 뒤 지급)`],
              ].map(([t, d], i, a) => (
                <View key={t} style={{ flexDirection: 'row', gap: 12, paddingBottom: 12 }}>
                  {i < a.length - 1 ? <View style={{ position: 'absolute', left: 13, top: 28, bottom: -4, width: 2, backgroundColor: '#F3C7D6' }} /> : null}
                  <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: i === 0 ? PINK : '#FFF3F7', borderWidth: i === 0 ? 0 : 1.5, borderColor: '#F3C7D6', alignItems: 'center', justifyContent: 'center' }}>
                    <Txt v="label2" w="bold" c={i === 0 ? color.white : PINK}>{i + 1}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="label1" w="bold" c={color.labelStrong} style={{ marginTop: 3 }}>{t}</Txt>
                    <Txt v="caption1" c={color.labelAlternative}>{d}</Txt>
                  </View>
                </View>
              ))}
            </View>
            {disc ? (
              <View style={{ paddingHorizontal: 24, paddingTop: 4, gap: 8 }}>
                <Txt v="label1" w="bold" c={color.labelStrong}>모인 돈은 이렇게 써요</Txt>
                <View style={{ flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
                  <View style={{ flex: disc.cost_per_100.creator, backgroundColor: PINK }} />
                  <View style={{ flex: disc.cost_per_100.issuance_cost, backgroundColor: '#EF6F9A' }} />
                  <View style={{ flex: disc.cost_per_100.reserve ?? 0, backgroundColor: '#F3C7D6' }} />
                  <View style={{ flex: disc.cost_per_100.dibs, backgroundColor: color.fillStrong }} />
                </View>
                <Txt v="caption1" w="medium" c={color.labelAlternative}>
                  작가 {disc.cost_per_100.creator}% · 발행 실비 {disc.cost_per_100.issuance_cost}% · 유보금 {disc.cost_per_100.reserve ?? 0}% · DIBS 운영비 {disc.cost_per_100.dibs}%
                </Txt>
                <Txt v="caption1" c={color.labelAssistive}>
                  작가 몫은 신탁에 두고 상장 40% · 약정 절반 30% · 완결 30%로 나눠 줘요.{disc.creator_token ? ` 작가에게 전체의 ${disc.creator_token.bps / 100}% 조각을 주고 ${disc.creator_token.lockup_months}개월 동안 팔 수 없어요.` : ''}
                </Txt>
              </View>
            ) : null}
            <View style={{ marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: color.cautionary, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="info" size={20} c={color.cautionary} />
              <Txt v="label2" w="bold" c={color.labelStrong} style={{ flex: 1 }}>원금 손실 가능 · 예금자보호 대상 아니에요</Txt>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.bgNormal, borderTopWidth: 1, borderTopColor: color.lineAlternative }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
          <Pressable onPress={open || listed || sub ? cta.go : undefined} accessibilityRole="button" accessibilityState={{ disabled: !(open || listed) }}
            style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: open || listed ? '#F6A9BF' : color.interactionDisable, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Txt v="body1" w="bold" c={open || listed ? '#5B1A33' : color.labelDisable}>{cta.label}</Txt>
          </Pressable>
        </View>
      </SafeAreaView>
      {note ? (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(25,31,40,0.88)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 }}><Txt v="label2" w="semibold" c={color.white}>{note}</Txt></View>
        </View>
      ) : null}
    </View>
  );
}

function Metric({ title, value, desc, vc = PINK, children }: { title: string; value: string; desc: string; vc?: string; children?: React.ReactNode }) {
  return (
    <View style={{ padding: 16, borderRadius: 18, backgroundColor: color.elevatedAlternative, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Txt v="label1" w="bold" c={color.labelStrong}>{title}</Txt>
        <Txt v="heading1" w="bold" c={vc} tabular>{value}</Txt>
      </View>
      {children}
      <Txt v="caption1" w="medium" c={color.labelAlternative} style={{ marginTop: 10, lineHeight: 18 }}>{desc}</Txt>
    </View>
  );
}
