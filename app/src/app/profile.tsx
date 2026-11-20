// 프로필 편집: 프로필 사진(디비 얼굴)·닉네임·한 줄 소개. 투자성향은 MY 메뉴의 '투자성향 확인'에서 따로.
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, TextInput, View } from 'react-native';

import { ErrorBox } from '@/components/ui';
import { Button, DScreen, TopAppBar, Txt, color, radius, spacing } from '@/ds';
import { api, ApiError } from '@/lib/api';
import { AVATARS, AVATAR_KEYS, avatarKey } from '@/lib/avatar';
import { hasProfanity } from '@/lib/profanity';
import { useSession } from '@/lib/session';

export default function ProfileEdit() {
  const { me, refreshMe } = useSession();
  const [face, setFace] = useState(avatarKey(me?.avatar_url));
  const [nick, setNick] = useState(me?.nickname ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const name = nick.trim();
  const problem = !name ? '닉네임을 입력해 주세요.' : name.length > 12 ? '닉네임은 12자까지 쓸 수 있어요.'
    : hasProfanity(name) || hasProfanity(bio) ? '바르고 고운 말을 써 주세요.' : null;

  async function save() {
    if (problem) return;
    setBusy(true); setError(null);
    try {
      await api.patch('/me', { nickname: name, bio: bio.trim(), avatar_url: `dibby:${face}` });
      await refreshMe();
      router.back();
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }

  const input = { backgroundColor: color.bgAlternative, color: color.labelStrong, borderRadius: radius.control, paddingHorizontal: spacing.insetL, paddingVertical: spacing.insetM, fontSize: 16 } as const;

  return (
    <>
    <Stack.Screen options={{ headerShown: false }} />
    <DScreen header={<TopAppBar type="Modal" title="프로필 편집" />} gap={spacing.gapXl}
      footer={<Button label={busy ? '저장 중…' : '저장하기'} disabled={!!problem || busy} onPress={save} />}>
      <ErrorBox error={error} />
      <View style={{ alignItems: 'center', gap: spacing.gapM }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#FDEBF1', overflow: 'hidden' }}>
          <Image source={AVATARS[face]} style={{ width: 96, height: 96 }} accessibilityLabel="내 프로필 사진" />
        </View>
        <Txt v="caption1" c={color.labelAlternative}>디비 얼굴 중에서 프로필 사진을 골라요</Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.gapM }}>
        {AVATAR_KEYS.map((k) => (
          <Pressable key={k} onPress={() => setFace(k)} accessibilityRole="button" accessibilityState={{ selected: face === k }}
            style={{ width: '23%', aspectRatio: 1, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#FDEBF1', borderWidth: 2, borderColor: face === k ? color.primaryNormal : 'transparent' }}>
            <Image source={AVATARS[k]} style={{ width: '100%', height: '100%' }} />
          </Pressable>
        ))}
      </View>
      <View style={{ gap: spacing.gapS }}>
        <Txt v="label1" w="bold" c={color.labelStrong}>닉네임</Txt>
        <TextInput value={nick} onChangeText={setNick} maxLength={20} placeholder="닉네임" placeholderTextColor={color.labelAssistive} style={input} />
        <Txt v="caption1" c={problem && nick ? color.negative : color.labelAssistive}>{problem && nick ? problem : `${name.length}/12`}</Txt>
      </View>
      <View style={{ gap: spacing.gapS }}>
        <Txt v="label1" w="bold" c={color.labelStrong}>한 줄 소개</Txt>
        <TextInput value={bio} onChangeText={setBio} maxLength={40} placeholder="좋아하는 장르나 작품을 적어 보세요" placeholderTextColor={color.labelAssistive} style={input} />
      </View>
    </DScreen>
    </>
  );
}
