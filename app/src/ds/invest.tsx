import { Image } from 'react-native';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Icon, Txt } from './base';
import { Badge, Button, LinearProgress, type BadgeType } from './controls';
import { StatGrid } from './layout';
import { color, radius, spacing } from './tokens';

// ── Cover (2:3) ── 표지 이미지가 없으면 작품 id로 고정한 면 + 제목
const TONES = [['#F7E3EC', '#9C3F66'], ['#E8E1F8', '#5B3FA8'], ['#DFEAF8', '#2B5DA8'], ['#FCEBD9', '#9A5A12'], ['#E2F2EA', '#1F7A4F'], ['#F1E4F4', '#7A3E87']] as const;
export function Cover({ id, title, url, size = 'Medium', dim, badge, style }: {
  id: number; title?: string; url?: string | null; size?: 'Large' | 'Medium' | 'Small'; dim?: boolean; badge?: string; style?: StyleProp<ViewStyle>;
}) {
  const r = size === 'Large' ? radius.card : size === 'Medium' ? radius.control : radius.thumb;
  const [bg, fg] = TONES[id % TONES.length];
  return (
    <View style={[{ width: '100%', aspectRatio: 2 / 3, borderRadius: r, overflow: 'hidden', backgroundColor: bg }, style]} accessibilityLabel={title ? `${title} 표지` : undefined}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : title ? (
        <View style={{ flex: 1, padding: size === 'Small' ? 6 : 12, justifyContent: 'flex-end' }}>
          <Txt v={size === 'Large' ? 'heading2' : size === 'Medium' ? 'label1' : 'caption2'} w="bold" c={fg} lines={size === 'Small' ? 3 : 4}>{title}</Txt>
        </View>
      ) : null}
      {dim ? <View style={[StyleSheet.absoluteFill, { backgroundColor: color.imageDim }]} /> : null}
      {badge ? <View style={{ position: 'absolute', top: spacing.insetM, right: spacing.insetM }}><Badge type="Overlay" label={badge} /></View> : null}
    </View>
  );
}

// ── Funding Progress ──
export function FundingProgress({ pct, raised, goal, layout = 'Detailed', closed }: { pct: number; raised: string; goal?: string; layout?: 'Detailed' | 'Compact'; closed?: boolean }) {
  const pc = closed ? color.labelAlternative : color.labelStrong;
  return (
    <View style={{ gap: spacing.gapS }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.gapM }}>
        <Txt v={layout === 'Detailed' ? 'title1' : 'label1'} w="bold" c={pc} tabular>{pct.toLocaleString('ko-KR')}%</Txt>
        <Txt v="caption1" c={color.labelAlternative}>
          <Txt v="caption1" w="semibold" c={color.labelStrong}>{raised}</Txt>
          {layout === 'Detailed' && goal ? ` / 목표 ${goal}` : ''}
        </Txt>
      </View>
      <LinearProgress value={pct} closed={closed} />
    </View>
  );
}

// ── Work Card ──
export type WorkStatus = '모집 중' | '모집 후' | '거래 중';
export type WorkCardData = { id: number; title: string; by?: string; genre?: string; format?: string; pct: number; raised: string; goal?: string; dday?: string; likes?: number; status: WorkStatus; coverUrl?: string | null };
export function WorkCard({ data: d, layout = 'Row', onPress, last }: { data: WorkCardData; layout?: 'Row' | 'List' | 'Grid' | 'Rail' | 'Hero'; onPress?: () => void; last?: boolean }) {
  const closed = d.status === '모집 후';
  const pc = closed ? color.labelAlternative : color.labelStrong;
  const btype: BadgeType = d.status === '모집 중' ? 'Recruiting' : d.status === '거래 중' ? 'Trading' : 'Closed';
  if (layout === 'Grid') {
    return (
      <Pressable onPress={onPress} style={{ flex: 1, gap: spacing.gapL }}>
        <Cover id={d.id} title={d.title} url={d.coverUrl} size="Medium" />
        <View style={{ gap: spacing.gapXs, paddingHorizontal: spacing.insetXs }}>
          <Txt v="body2" w="semibold" c={color.labelStrong} lines={1}>{d.title}</Txt>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt v="caption1" c={color.labelAlternative} lines={1} style={{ flex: 1 }}>{d.genre}{d.likes != null ? ` · ${d.likes.toLocaleString('ko-KR')}명 찜` : ''}</Txt>
            <Txt v="caption1" w="bold" c={pc}>{d.pct.toLocaleString('ko-KR')}%</Txt>
          </View>
          <LinearProgress value={d.pct} closed={closed} />
        </View>
      </Pressable>
    );
  }
  if (layout === 'Rail') {
    return (
      <Pressable onPress={onPress} style={{ width: 124, gap: spacing.gapM }}>
        <Cover id={d.id} title={d.title} url={d.coverUrl} size="Small" />
        <Txt v="label2" w="semibold" c={color.labelStrong} lines={2} style={{ minHeight: 38 }}>{d.title}</Txt>
        <Txt v="caption1" c={color.labelAlternative}>{d.format ?? '웹툰'} · <Txt v="caption1" w="bold" c={pc}>{d.pct.toLocaleString('ko-KR')}%</Txt></Txt>
      </Pressable>
    );
  }
  if (layout === 'List') {
    return (
      <Pressable onPress={onPress} style={{ flexDirection: 'row', gap: spacing.gapL, alignItems: 'center', paddingVertical: spacing.insetS }}>
        <View style={{ width: 84 }}><Cover id={d.id} title={d.title} url={d.coverUrl} size="Small" /></View>
        <View style={{ flex: 1, gap: spacing.gapXs }}>
          <View style={{ flexDirection: 'row', gap: spacing.gapS }}>
            <Badge type={btype} label={d.status} />
            {d.dday ? <Badge type="Neutral" label={d.dday} /> : null}
          </View>
          <Txt v="body2" w="semibold" c={color.labelStrong} lines={1}>{d.title}</Txt>
          {d.by ? <Txt v="caption1" c={color.labelAlternative} lines={1}>{d.by}</Txt> : null}
          <FundingProgress layout="Compact" pct={d.pct} raised={d.raised} closed={closed} />
        </View>
      </Pressable>
    );
  }
  if (layout === 'Hero') {
    return (
      <Pressable onPress={onPress} style={s.hero}>
        <Cover id={d.id} title={d.title} url={d.coverUrl} size="Large" badge={`${d.status}${d.dday ? ` · ${d.dday}` : ''}`} style={{ borderRadius: 0 }} />
        <View style={{ padding: spacing.insetL, gap: spacing.gapL }}>
          {d.by ? <Txt v="caption1" c={color.labelAlternative}>{d.by}</Txt> : null}
          <FundingProgress pct={d.pct} raised={d.raised} goal={d.goal} closed={closed} />
        </View>
      </Pressable>
    );
  }
  // Row (기본)
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.7 }]}>
      <View style={{ width: 56 }}><Cover id={d.id} title={d.title} url={d.coverUrl} size="Small" dim /></View>
      <View style={{ flex: 1, gap: spacing.gapXs }}>
        <Txt v="label1" w="semibold" c={color.labelStrong} lines={1}>{d.title}</Txt>
        <Txt v="caption1" c={color.labelAlternative} lines={1}>{[d.format, d.genre].filter(Boolean).join(' · ')}</Txt>
        <Txt v="caption1" w="medium" c={d.status === '모집 중' ? color.cautionary : color.labelAlternative}>{d.status}{d.dday ? ` · ${d.dday}` : ''}</Txt>
      </View>
      <View style={{ width: 96, alignItems: 'flex-end', gap: spacing.gapXs }}>
        <Txt v="body1" w="bold" c={pc} tabular>{d.pct.toLocaleString('ko-KR')}%</Txt>
        <Txt v="caption1" c={color.labelAlternative} lines={1}>{d.raised}</Txt>
        <View style={{ width: '100%' }}><LinearProgress value={d.pct} closed={closed} size="Small" /></View>
      </View>
    </Pressable>
  );
}

// ── Amount Display ──
export function AmountDisplay({ label, value, change, trend = 'Flat', unit = '원' }: { label: string; value: string; change?: string; trend?: 'Rise' | 'Fall' | 'Flat'; unit?: string }) {
  const tc = trend === 'Rise' ? color.rise : trend === 'Fall' ? color.fall : color.labelAlternative;
  return (
    <View style={{ gap: spacing.gap2xs }}>
      <Txt v="label2" w="medium" c={color.labelAlternative}>{label}</Txt>
      <Txt v="title1" w="bold" c={color.labelStrong} tabular>{value}<Txt v="heading2" w="bold" c={color.labelStrong}>{unit}</Txt></Txt>
      {change ? <Txt v="label2" w="semibold" c={tc} tabular>{change}</Txt> : null}
    </View>
  );
}

// ── Portfolio Bar (비중 막대) ──
const BAR_COLORS = ['#DE5786', '#7C5CD6', '#3182F6', '#12B76A', '#D98A00', '#8B95A1'];
export function PortfolioBar({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) return <View style={{ height: 8, borderRadius: 4, backgroundColor: color.fillNormal }} />;
  return (
    <View style={{ gap: spacing.gapM }}>
      <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', gap: 2 }}>
        {items.map((it, i) => <View key={it.label} style={{ flex: it.value / total, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.gapL, rowGap: spacing.gapXs }}>
        {items.map((it, i) => (
          <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapXs }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
            <Txt v="caption1" c={color.labelNeutral} lines={1}>{it.label} {Math.round((it.value / total) * 100)}%</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Portfolio Summary ──
export function PortfolioSummary({ total, change, trend, items, stats, onMore }: {
  total: string; change?: string; trend?: 'Rise' | 'Fall' | 'Flat'; items: { label: string; value: number }[]; stats?: { label: string; value: string }[]; onMore?: () => void;
}) {
  return (
    <View style={s.panel}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <AmountDisplay label="내 투자 자산" value={total} change={change} trend={trend} />
        {onMore ? <Button label="자산 보기" variant="Text" tone="Assistive" size="Small" fill={false} onPress={onMore} /> : null}
      </View>
      <PortfolioBar items={items} />
      {stats ? <StatGrid items={stats} /> : null}
    </View>
  );
}

// ── Sparkline / Index Chart ──
function linePath(values: number[], w: number, h: number) {
  if (values.length < 2) return { line: '', area: '' };
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - min) / span) * (h - 4) - 2]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}
export function Sparkline({ values, up, width = 120, height = 40 }: { values: number[]; up: boolean; width?: number; height?: number }) {
  const { line, area } = linePath(values, width, height);
  const c = up ? color.rise : color.fall;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c} stopOpacity={0.18} />
          <Stop offset="1" stopColor={c} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {area ? <Path d={area} fill="url(#g)" /> : null}
      {line ? <Path d={line} stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" /> : null}
    </Svg>
  );
}
export function IndexChart({ name, value, change, asof, values, up }: { name: string; value: string; change: string; asof?: string; values: number[]; up: boolean }) {
  return (
    <View style={[s.panel, { flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, paddingVertical: spacing.insetL }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="caption1" w="medium" c={color.labelAlternative}>{name}</Txt>
        <Txt v="heading2" w="bold" c={color.labelStrong} tabular>{value}</Txt>
        <Txt v="label2" w="semibold" c={up ? color.rise : color.fall} tabular>{change}</Txt>
        {asof ? <Txt v="caption2" c={color.labelAssistive}>{asof}</Txt> : null}
      </View>
      <Sparkline values={values} up={up} width={128} height={56} />
    </View>
  );
}

// ── Invest Summary (작품 투자 요약 헤더) ──
export function InvestSummary({ id, title, by, format = '웹툰', status, statusText, mainLabel = '모집률', mainValue, mainSub, progress, stats, compact, coverUrl, actions }: {
  id: number; title: string; by?: string; format?: string; status: 'Recruiting' | 'Closed' | 'Trading'; statusText: string; mainLabel?: string; mainValue: string; mainSub?: string;
  progress: number; stats: { label: string; value: string }[]; compact?: boolean; coverUrl?: string | null; actions?: { left: { label: string; icon?: string; onPress: () => void }; right: { label: string; icon?: string; onPress: () => void } };
}) {
  return (
    <View style={[s.panel, { gap: spacing.gapXl }]}>
      <View style={{ flexDirection: 'row', gap: spacing.gapXl, alignItems: 'flex-start' }}>
        <View style={{ width: 84 }}><Cover id={id} title={title} url={coverUrl} size="Medium" /></View>
        <View style={{ flex: 1, gap: spacing.gapS }}>
          {!compact ? (
            <View style={{ flexDirection: 'row', gap: spacing.gapS, flexWrap: 'wrap' }}>
              <Badge type={format === '웹소설' ? 'Novel' : 'Webtoon'} label={format} />
              <Badge type={status} label={statusText} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.gapM }}>
            <Txt v="heading2" w="bold" c={color.labelStrong} style={{ flex: 1 }}>{title}</Txt>
            {compact ? <Txt v="label1" w="bold" c={color.highlight} tabular>{mainValue}</Txt> : null}
          </View>
          {by ? <Txt v="caption1" c={color.labelAlternative}>{by}</Txt> : null}
        </View>
      </View>
      {!compact ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.gapL }}>
          <View style={{ gap: spacing.gap2xs }}>
            <Txt v="caption1" c={color.labelAlternative}>{mainLabel}</Txt>
            <Txt v="title1" w="bold" c={color.labelStrong} tabular>{mainValue}</Txt>
          </View>
          {mainSub ? <Txt v="label2" w="medium" c={color.labelNeutral} style={{ textAlign: 'right', flexShrink: 1 }}>{mainSub}</Txt> : null}
        </View>
      ) : mainSub ? (
        <Txt v="label2" w="medium" c={color.labelNeutral} style={{ textAlign: 'right' }}>{mainSub}</Txt>
      ) : null}
      <LinearProgress value={progress} closed={status === 'Closed'} />
      <StatGrid items={stats} />
      {actions ? (
        <View style={{ flexDirection: 'row', gap: spacing.gapL, paddingTop: spacing.insetL, borderTopWidth: 1, borderTopColor: color.lineNormal }}>
          <View style={{ flex: 1 }}><Button label={actions.left.label} icon={actions.left.icon} tone="Assistive" size="Medium" onPress={actions.left.onPress} /></View>
          <View style={{ flex: 1 }}><Button label={actions.right.label} icon={actions.right.icon} size="Medium" onPress={actions.right.onPress} /></View>
        </View>
      ) : null}
    </View>
  );
}

// ── Offering Table (공모 조건 표) ──
export function OfferingTable({ rows }: { rows: { k: string; v: string; strong?: boolean }[] }) {
  return (
    <View style={[s.panel, { gap: 0, paddingVertical: spacing.insetS }]}>
      {rows.map((r, i) => (
        <View key={r.k} style={[s.otRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
          <Txt v="label1" c={color.labelAlternative} style={{ width: 104 }}>{r.k}</Txt>
          <Txt v="label1" w={r.strong ? 'bold' : 'semibold'} c={r.strong ? color.highlight : color.labelStrong} style={{ flex: 1, textAlign: 'right' }}>{r.v}</Txt>
        </View>
      ))}
    </View>
  );
}

// ── Offering Timeline (청약 일정) ──
export function OfferingTimeline({ steps }: { steps: { label: string; date: string; state: 'done' | 'now' | 'next' }[] }) {
  return (
    <View style={[s.panel, { gap: 0 }]}>
      {steps.map((st, i) => {
        const dot = st.state === 'done' ? color.labelAssistive : st.state === 'now' ? color.primaryNormal : color.lineNeutral;
        return (
          <View key={st.label} style={{ flexDirection: 'row', gap: spacing.gapL, minHeight: 44 }}>
            <View style={{ alignItems: 'center', width: 12 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, backgroundColor: st.state === 'now' ? dot : color.bgNormal, borderWidth: 2, borderColor: dot }} />
              {i < steps.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: color.lineAlternative, marginTop: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing.insetM }}>
              <Txt v="label1" w={st.state === 'now' ? 'bold' : 'medium'} c={st.state === 'next' ? color.labelAlternative : color.labelStrong}>{st.label}</Txt>
              <Txt v="label2" c={st.state === 'now' ? color.highlight : color.labelAlternative} tabular>{st.date}</Txt>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Risk Level (5단계) ──
const RISK = ['매우 낮음', '낮음', '보통', '높음', '매우 높음'];
export function RiskLevel({ level = 5, note }: { level?: number; note?: string }) {
  return (
    <View style={[s.panel, { gap: spacing.gapM }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt v="body1" w="bold" c={color.labelStrong}>위험 등급</Txt>
        <Txt v="body1" w="bold" c={color.negative}>{RISK[level - 1]}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {RISK.map((r, i) => <View key={r} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < level ? (i >= 3 ? color.negative : color.cautionary) : color.fillNormal }} />)}
      </View>
      <Txt v="caption1" c={color.labelAlternative}>{note ?? '원금 손실이 날 수 있고, 예금자 보호를 받지 않아요.'}</Txt>
    </View>
  );
}

// ── Return Sim (시나리오별 배수) ──
export function ReturnSim({ amount, rows, note }: { amount: number; rows: { label: string; multiple: number | null; months: number | null }[]; note?: string }) {
  const max = Math.max(1.5, ...rows.map((r) => r.multiple ?? 0));
  return (
    <View style={[s.panel, { gap: spacing.gapL }]}>
      <View style={{ gap: 2 }}>
        <Txt v="body1" w="bold" c={color.labelStrong}>{amount.toLocaleString('ko-KR')}원을 넣으면</Txt>
        <Txt v="caption1" c={color.labelAlternative}>실제 유료 팬 수에 따라 2년 동안 돌려받는 돈 (세후)</Txt>
      </View>
      {rows.map((r) => {
        const m = r.multiple ?? 0;
        const loss = m < 1;
        return (
          <View key={r.label} style={{ gap: spacing.gapXs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt v="label2" c={color.labelNeutral}>{r.label}</Txt>
              <Txt v="label2" w="bold" c={loss ? color.fall : color.labelStrong} tabular>
                {Math.round(amount * m).toLocaleString('ko-KR')}원 · {m.toFixed(2)}배{r.months ? ` · ${r.months}개월 회수` : loss ? ' · 원금 손실' : ''}
              </Txt>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: color.fillNormal, overflow: 'hidden' }}>
              <View style={{ width: `${(m / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: loss ? color.fall : color.primaryNormal }} />
            </View>
          </View>
        );
      })}
      {note ? <Txt v="caption1" c={color.labelAlternative}>{note}</Txt> : null}
    </View>
  );
}

// ── Market Cell ──
export function MarketCell({ id, title, meta, price, change, trend, favorite, onPress, last }: {
  id: number; title: string; meta: string; price: string; change: string; trend: 'Rise' | 'Fall' | 'Flat'; favorite?: boolean; onPress?: () => void; last?: boolean;
}) {
  const tc = trend === 'Rise' ? color.rise : trend === 'Fall' ? color.fall : color.labelAlternative;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.mc, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.7 }]}>
      <View style={{ width: 44 }}><Cover id={id} title={title} size="Small" /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="label1" w="semibold" c={color.labelStrong} lines={1}>{title}</Txt>
        <Txt v="caption1" c={color.labelAlternative} lines={1}>{meta}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Txt v="body2" w="bold" c={color.labelStrong} tabular>{price}</Txt>
        <Txt v="caption1" w="semibold" c={tc} tabular>{change}</Txt>
      </View>
      {favorite !== undefined ? <Icon name={favorite ? 'star' : 'starL'} size={20} c={favorite ? color.cautionary : color.labelDisable} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  panel: { borderRadius: radius.sheet, backgroundColor: color.elevatedNormal, borderWidth: 1, borderColor: color.lineAlternative, padding: spacing.insetXl, gap: spacing.gapL },
  row: { flexDirection: 'row', gap: spacing.gapL, alignItems: 'center', paddingVertical: spacing.insetM, borderBottomWidth: 1, borderBottomColor: color.lineAlternative },
  hero: { borderRadius: radius.sheet, borderWidth: 1, borderColor: color.lineAlternative, backgroundColor: color.elevatedNormal, overflow: 'hidden' },
  otRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderBottomColor: color.lineAlternative, gap: spacing.gapL },
  mc: { flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, paddingVertical: spacing.insetM, borderBottomWidth: 1, borderBottomColor: color.lineAlternative, minHeight: 72 },
});
