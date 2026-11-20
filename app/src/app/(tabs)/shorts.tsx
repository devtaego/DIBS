import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, LinearProgress, Txt, color, radius, spacing, textStyle } from '@/ds';
import { api, track, type FundingCard, type SecurityItem, type ShortItem } from '@/lib/api';
import { ddayText, manwon, signedPct } from '@/lib/cards';
import { hasProfanity, maskProfanity } from '@/lib/profanity';
import { phaseOf, type Phase } from '@/lib/phase';
import { shareWork } from '@/lib/share';
import { useApi } from '@/lib/useApi';
import { ShortVideo, isPlayable } from '@/components/ShortVideo';

// 순환 재생: 마지막 다음에 처음이 오도록 목록을 여러 번 이어 붙인다
const LAPS = 50;
const FEEDS = ['추천', '팔로잉', '펀딩 중', '투자 모집 중'] as const;
const LIGHT = '#F3E8EE';
const DIM = 'rgba(243,232,238,0.72)';

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// V2 03 쇼츠 — 몰입형(하단 탭 없음, X 로 닫기). 위: 진행 막대 + 피드 탭, 오른쪽: 좋아요·댓글·공유·소리, 아래: 작품 + 펀딩 카드.
// 재생 가능한 영상이 있으면 그 영상들만 차례로 돌린다 (끝나면 다음, 마지막 다음은 처음).
export default function Shorts() {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(0);
  const [feed, setFeed] = useState<(typeof FEEDS)[number]>('추천');
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(true);
  const listRef = useRef<FlatList<number>>(null);
  const { data } = useApi(async () => {
    const [shorts, fundings, securities, dibs] = await Promise.all([
      api.get<ShortItem[]>('/shorts/feed', { limit: 50 }),
      api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
      api.get<SecurityItem[]>('/market/securities', { sort: 'change' }).catch(() => [] as SecurityItem[]),
      api.get<{ id: number }[]>('/me/dibs').catch(() => [] as { id: number }[]),
    ]);
    return { shorts, fundings, securities, dibbed: new Set(dibs.map((d) => d.id)) };
  });
  const fundingById = useMemo(() => new Map((data?.fundings ?? []).map((f) => [f.id, f])), [data]);
  const secById = useMemo(() => new Map((data?.securities ?? []).map((x) => [x.funding_id, x])), [data]);
  const [sheet, setSheet] = useState<ShortItem | null>(null);
  const [toast, setToast] = useState('');
  const flash = (t: string) => { if (!t) return; setToast(t); setTimeout(() => setToast(''), 1800); };
  const items = useMemo(() => {
    const all = data?.shorts ?? [];
    const playable = all.filter((sh) => isPlayable(sh.video_url));
    const base = playable.length ? playable : all;
    // 펀딩 중·투자 모집 중 탭은 모집 중인 작품만
    return feed === '펀딩 중' || feed === '투자 모집 중' ? base.filter((sh) => sh.funding_status === 'OPEN') : base;
  }, [data, feed]);
  const n = items.length;
  const cycle = n > 1;
  const slots = useMemo(() => Array.from({ length: n * (cycle ? LAPS : 1) }, (_, i) => i), [n, cycle]);
  const next = useCallback(
    (from: number) => listRef.current?.scrollToIndex({ index: Math.min(from + 1, slots.length - 1), animated: true }),
    [slots.length],
  );
  useEffect(() => {
    data?.shorts.forEach((sh) => track('SHORT_PLAY', { work_id: sh.work_id, short_id: sh.id }));
  }, [data]);
  useEffect(() => {
    setCurrent(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [feed]);

  const close = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h ? (
        <FlatList
          ref={listRef}
          data={slots}
          keyExtractor={(i) => String(i)}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: h, offset: h * index, index })}
          windowSize={3}
          initialNumToRender={2}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.y / h);
            if (i !== current) setCurrent(i);
          }}
          ListEmptyComponent={
            <View style={{ height: h, alignItems: 'center', justifyContent: 'center', gap: spacing.gapM }}>
              <Txt v="body1" w="bold" c={LIGHT}>쇼츠는 곧 열려요</Txt>
              <Txt v="label2" c={DIM}>작품 하이라이트 영상을 준비하고 있어요.</Txt>
            </View>
          }
          renderItem={({ item: slot }) => {
            const sh = items[slot % n];
            const f = sh.funding_id ? fundingById.get(sh.funding_id) : undefined;
            const on = liked[sh.id] ?? !!data?.dibbed.has(sh.work_id);
            return (
              <View style={{ height: h }}>
                <ShortVideo
                  full
                  url={sh.video_url}
                  durationSec={sh.duration_sec}
                  active={slot === current}
                  muted={muted}
                  loop={!cycle}
                  onEnded={() => next(slot)}
                  onToggleMute={() => setMuted(!muted)}
                  scrubBottom={insets.bottom + 4}
                />
                <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={[s.shade, { top: 0, height: 150 + insets.top }]} />
                <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']} style={[s.shade, { bottom: 0, height: 360 }]} />

                <View style={[s.actions, { bottom: 236 + insets.bottom }]}>
                  {[
                    { icon: on ? 'heartF' : 'heart', label: on ? '찜함' : '찜', c: on ? '#F6A9BF' : LIGHT, onPress: () => { setLiked({ ...liked, [sh.id]: !on }); (on ? api.del(`/works/${sh.work_id}/dib`) : api.put(`/works/${sh.work_id}/dib`)).catch(() => {}); } },
                    { icon: 'cmt', label: `댓글 ${commentsOf(sh).length}`, c: LIGHT, onPress: () => setSheet(sh) },
                    { icon: 'share', label: '공유', c: LIGHT, onPress: async () => flash(await shareWork(sh.work_id, sh.work_title)) },
                    { icon: muted ? 'volOff' : 'vol', label: muted ? '소리 켜기' : '소리 끄기', c: LIGHT, onPress: () => setMuted(!muted) },
                  ].map((a) => (
                    <Pressable key={a.label} accessibilityLabel={a.label} onPress={a.onPress} style={s.act}>
                      <Icon name={a.icon} size={28} c={a.c} />
                      <Txt v="caption2" w="semibold" c={LIGHT}>{a.label}</Txt>
                    </Pressable>
                  ))}
                </View>

                <View pointerEvents="box-none" style={[s.bottom, { paddingBottom: insets.bottom + 34 }]}>
                  <View style={{ gap: 4, paddingRight: 64 }}>
                    <Txt v="headline1" w="bold" c={LIGHT} lines={1}>{sh.work_title}</Txt>
                    <Txt v="caption1" c={DIM} lines={1}>{`${mmss(sh.duration_sec)} 티저${f ? ` · 청약 ${ddayText(f) || '중'}` : ''}`}</Txt>
                  </View>
                  <PhaseCard sh={sh} f={f} sec={sh.funding_id ? secById.get(sh.funding_id) : undefined} dibbed={on} onDib={() => { setLiked({ ...liked, [sh.id]: true }); api.put(`/works/${sh.work_id}/dib`).catch(() => {}); flash('찜했어요 · 공모가 열리면 알려 드릴게요'); }} />
                </View>
              </View>
            );
          }}
        />
      ) : null}

      {/* 위: 진행 막대 + 피드 탭 + 닫기 (넘겨도 고정) */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        {cycle ? (
          <View style={s.stories} pointerEvents="none">
            {items.map((sh, i) => (
              <View key={sh.id} style={[s.story, { backgroundColor: i <= current % n ? LIGHT : 'rgba(243,232,238,0.32)' }]} />
            ))}
          </View>
        ) : null}
        <View style={s.feedRow}>
          {FEEDS.map((x) => (
            <Pressable key={x} onPress={() => setFeed(x)} hitSlop={6} style={{ paddingVertical: 6 }}>
              <Txt v="label1" w={feed === x ? 'bold' : 'medium'} c={feed === x ? LIGHT : DIM}>{x}</Txt>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <Pressable accessibilityLabel="쇼츠 닫기" onPress={close} hitSlop={10}>
            <Icon name="close" size={26} c={LIGHT} />
          </Pressable>
        </View>
      </View>
      {sheet ? <CommentSheet sh={sheet} onClose={() => setSheet(null)} bottomInset={insets.bottom} /> : null}
      {toast ? (
        <View pointerEvents="none" style={[s.toast, { top: insets.top + 80 }]}>
          <Txt v="label2" w="semibold" c="#FFFFFF">{toast}</Txt>
        </View>
      ) : null}
    </View>
  );
}

// ── 단계별 하단 카드: 공모 전(찜·알림) / 공모 중(투자) / 공모 종료(거래·시세) ──
const phaseOfShort = (sh: ShortItem): Phase => phaseOf(sh.funding_status);
const PHASE_STYLE: Record<Phase, { label: string; tint: string; line: string }> = {
  PRE: { label: '공모 전', tint: 'rgba(78,64,170,0.62)', line: 'rgba(163,148,255,0.5)' },
  OPEN: { label: '공모 중', tint: 'rgba(18,16,28,0.72)', line: 'rgba(246,169,191,0.55)' },
  CLOSED: { label: '공모 종료', tint: 'rgba(14,52,60,0.66)', line: 'rgba(120,214,200,0.45)' },
};

function PhaseCard({ sh, f, sec, dibbed, onDib }: { sh: ShortItem; f?: FundingCard; sec?: SecurityItem; dibbed: boolean; onDib: () => void }) {
  const ph = phaseOfShort(sh);
  const st = PHASE_STYLE[ph];
  const head = (right?: React.ReactNode) => (
    <View style={s.row}>
      <View style={[s.pill, { borderColor: st.line, backgroundColor: 'rgba(255,255,255,0.08)' }]}><Txt v="caption2" w="bold" c={LIGHT}>{st.label}</Txt></View>
      {right}
    </View>
  );
  const more = (to: string) => (
    <Pressable onPress={() => router.push(to as never)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Txt v="caption1" w="semibold" c={DIM}>상세</Txt>
      <Icon name="chev" size={14} c={DIM} />
    </Pressable>
  );

  if (ph === 'OPEN' && f) {
    return (
      <View style={[s.card, { backgroundColor: st.tint, borderColor: st.line }]}>
        {head(<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Txt v="caption1" w="bold" c="#F6A9BF">{`마감 ${ddayText(f) || '임박'}`}</Txt>{more(`/funding/${f.id}`)}</View>)}
        <View style={s.row}>
          <Txt v="body1" w="bold" c="#F6A9BF" tabular>{`${Math.round(f.progress.achievement_pct).toLocaleString('ko-KR')}% 달성`}</Txt>
          <Txt v="caption1" c={DIM}>{`목표 ${manwon(f.target_amount)}`}</Txt>
        </View>
        <LinearProgress value={f.progress.achievement_pct} />
        <View style={[s.row, { alignItems: 'flex-end' }]}>
          <View style={{ gap: 2 }}>
            <Txt v="caption2" c={DIM}>모집 금액</Txt>
            <Txt v="headline1" w="bold" c={LIGHT} tabular>{`${f.progress.raised_amount.toLocaleString('ko-KR')}원`}</Txt>
          </View>
          <Pressable style={[s.cta, { backgroundColor: '#F6A9BF' }]} onPress={() => { track('FUNDING_CTA', { work_id: sh.work_id, funding_id: f.id, referrer: 'shorts' }); router.push(`/funding/${f.id}`); }}>
            <Txt v="label1" w="bold" c={color.onPrimarySoft}>투자하기</Txt>
            <Icon name="arrow" size={16} c={color.onPrimarySoft} />
          </Pressable>
        </View>
      </View>
    );
  }
  if (ph === 'CLOSED') {
    const price = sec ? sec.last_price ?? sec.unit_price : null;
    return (
      <View style={[s.card, { backgroundColor: st.tint, borderColor: st.line }]}>
        {head(sh.funding_id ? more(sec ? `/security/${sh.funding_id}` : `/funding/${sh.funding_id}`) : undefined)}
        {sec && price != null ? (
          <View style={[s.row, { alignItems: 'flex-end' }]}>
            <View style={{ gap: 2 }}>
              <Txt v="caption2" c={DIM}>조각 현재가 · 공모가 {sec.unit_price.toLocaleString('ko-KR')}원</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Txt v="headline1" w="bold" c={LIGHT} tabular>{`${price.toLocaleString('ko-KR')}원`}</Txt>
                <Txt v="label2" w="bold" c={(sec.change_pct ?? 0) >= 0 ? '#FF8A8A' : '#7FB2FF'} tabular>{signedPct(sec.change_pct)}</Txt>
              </View>
            </View>
            <Pressable style={[s.cta, { backgroundColor: '#8EE3D3' }]} onPress={() => router.push(`/security/${sh.funding_id}`)}>
              <Txt v="label1" w="bold" c="#0B3B35">시세 보기</Txt>
              <Icon name="arrow" size={16} c="#0B3B35" />
            </Pressable>
          </View>
        ) : (
          <Txt v="label2" c={DIM}>공모가 끝나 배정을 진행하고 있어요.</Txt>
        )}
      </View>
    );
  }
  // 공모 전: 찜하면 공모 시작 알림
  return (
    <View style={[s.card, { backgroundColor: st.tint, borderColor: st.line }]}>
      {head(<Pressable onPress={() => router.push(`/work/${sh.work_id}`)} hitSlop={8}><Txt v="caption1" w="semibold" c={DIM}>작품 보기</Txt></Pressable>)}
      <View style={[s.row, { alignItems: 'center' }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="label1" w="bold" c={LIGHT}>아직 공모 전이에요</Txt>
          <Txt v="caption1" c={DIM}>찜해 두면 공모가 열릴 때 먼저 알려 드려요</Txt>
        </View>
        <Pressable style={[s.cta, { backgroundColor: dibbed ? 'rgba(255,255,255,0.18)' : '#B9AEFF' }]} onPress={onDib} disabled={dibbed}>
          <Icon name={dibbed ? 'check' : 'bell'} size={16} c={dibbed ? LIGHT : '#231A63'} />
          <Txt v="label1" w="bold" c={dibbed ? LIGHT : '#231A63'}>{dibbed ? '알림 받는 중' : '찜하고 알림'}</Txt>
        </Pressable>
      </View>
    </View>
  );
}

// ── 댓글 시트 (시연: 작품별 예시 댓글 + 이번 세션에 쓴 댓글, 욕설 필터) ──
type Cmt = { id: string; name: string; text: string; time: string; likes: number };
const SAMPLE = [
  '이 작품 진짜 뜰 것 같아요', '1화 컷 연출 미쳤다', '조각 벌써 담았어요 ㅎㅎ', '티저만 봐도 다음 화가 궁금해요',
  '작화 너무 좋아요', '공모 열리면 바로 들어갑니다', '드라마화 되면 좋겠다', 'OST까지 나오면 대박',
];
const written: Record<number, Cmt[]> = {};
function commentsOf(sh: ShortItem): Cmt[] {
  const base = Array.from({ length: 3 + (sh.work_id % 3) }, (_, i) => ({
    id: `s${sh.work_id}-${i}`,
    name: ['조각러', '찜부자', '웹툰덕후', '새벽독자', '디비팬'][(sh.work_id + i) % 5] + (10 + ((sh.work_id * 7 + i * 13) % 89)),
    text: SAMPLE[(sh.work_id + i * 3) % SAMPLE.length],
    time: `${1 + ((sh.work_id + i) % 9)}시간 전`,
    likes: (sh.work_id * 17 + i * 31) % 120,
  }));
  return [...(written[sh.work_id] ?? []), ...base];
}

function CommentSheet({ sh, onClose, bottomInset }: { sh: ShortItem; onClose: () => void; bottomInset: number }) {
  const [text, setText] = useState('');
  const [warn, setWarn] = useState('');
  const [, force] = useState(0);
  const list = commentsOf(sh);
  const bad = hasProfanity(text);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    if (hasProfanity(t)) {
      setWarn('욕설·비속어가 들어 있어 등록할 수 없어요. 다른 표현으로 써 주세요.');
      return;
    }
    written[sh.work_id] = [{ id: `w${Date.now()}`, name: '나', text: t, time: '방금', likes: 0 }, ...(written[sh.work_id] ?? [])];
    setText('');
    setWarn('');
    force((n) => n + 1);
  };
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={onClose} accessibilityLabel="댓글 닫기" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap} pointerEvents="box-none">
        <View style={[s.sheet, { paddingBottom: bottomInset + 12 }]}>
          <View style={s.grab} />
          <View style={[s.row, { paddingHorizontal: spacing.insetL }]}>
            <Txt v="body1" w="bold" c={color.labelStrong}>{`댓글 ${list.length}`}</Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="댓글 닫기"><Icon name="close" size={22} c={color.labelNeutral} /></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingHorizontal: spacing.insetL, gap: spacing.gapL, paddingVertical: spacing.insetM }}>
            {list.map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', gap: spacing.gapM }}>
                <View style={s.avatar}><Txt v="caption1" w="bold" c={color.primaryStrong}>{c.name.slice(0, 1)}</Txt></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="caption1" c={color.labelAlternative}>{`${c.name} · ${c.time}`}</Txt>
                  <Txt v="label2" c={color.labelNormal}>{maskProfanity(c.text)}</Txt>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Icon name="heart" size={16} c={color.labelAssistive} />
                  <Txt v="caption2" c={color.labelAssistive}>{c.likes}</Txt>
                </View>
              </View>
            ))}
          </ScrollView>
          {warn || bad ? <Txt v="caption1" c={color.negative} style={{ paddingHorizontal: spacing.insetL }}>{warn || '욕설·비속어가 들어 있어요. 고운 말로 바꿔 주세요.'}</Txt> : null}
          <View style={s.inputRow}>
            <TextInput
              value={text}
              onChangeText={(t) => { setText(t); if (warn) setWarn(''); }}
              placeholder="응원 댓글을 남겨 주세요"
              placeholderTextColor={color.labelAssistive}
              onSubmitEditing={send}
              returnKeyType="send"
              style={[textStyle('label1'), { flex: 1, color: color.labelStrong, paddingVertical: 10 }]}
              accessibilityLabel="댓글 입력"
            />
            <Pressable onPress={send} disabled={!text.trim() || bad} style={[s.send, (!text.trim() || bad) && { opacity: 0.4 }]} accessibilityLabel="댓글 등록">
              <Icon name="send" size={18} c="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#FFFFFF', paddingTop: 8, gap: spacing.gapS },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.lineNormal, marginBottom: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FDEBF1', alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.gapS, marginHorizontal: spacing.insetL, paddingLeft: 14, paddingRight: 6, borderRadius: 999, backgroundColor: color.bgAlternative },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.primaryNormal, alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', left: 0, right: 0 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.screen, gap: spacing.gapM },
  stories: { flexDirection: 'row', gap: 4 },
  story: { flex: 1, height: 2.5, borderRadius: 2 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.gapL },
  actions: { position: 'absolute', right: spacing.insetM, gap: spacing.gapL, alignItems: 'center' },
  act: { alignItems: 'center', gap: 2, minWidth: 48 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.insetL, gap: spacing.gapL },
  card: { gap: spacing.gapM, padding: spacing.insetL, borderRadius: radius.card, backgroundColor: 'rgba(18,16,28,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(222,87,134,0.32)', borderWidth: 1, borderColor: 'rgba(246,169,191,0.5)' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: spacing.insetL, borderRadius: 999, backgroundColor: '#F6A9BF' },
});
