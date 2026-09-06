import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { uploadAndTranscribe } from '@/lib/api';
import { getSession, startSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/lib/theme';

type Phase = 'idle' | 'uploading';

function ActionCircle({
  symbol,
  label,
  onPress,
  busy,
}: {
  symbol: string;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable style={styles.actionItem} onPress={onPress} disabled={busy}>
      <View style={styles.actionCircle}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <SymbolView name={symbol as never} size={24} tintColor={colors.onAccent} />
        )}
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const session = getSession();

  useEffect(() => {
    if (!session?.videoUri) return;
    VideoThumbnails.getThumbnailAsync(session.videoUri, { time: 800 })
      .then((r) => setLastThumb(r.uri))
      .catch(() => {});
  }, [session?.videoUri]);

  const pickAndTranscribe = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 180,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];

    setPhase('uploading');
    try {
      const result = await uploadAndTranscribe(asset.uri);
      startSession({
        videoUri: asset.uri,
        segments: result.segments,
        duration: result.duration,
      });
      router.push('/editor');
    } catch (e) {
      Alert.alert('משהו השתבש', e instanceof Error ? e.message : 'נסו שוב');
    } finally {
      setPhase('idle');
    }
  };

  const firstLine = session?.segments?.[0]?.text ?? '';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* header: wordmark + Pro pill */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>כתוביות</Text>
          <Pressable
            style={styles.proPill}
            onPress={() => Alert.alert('Pro', 'מסלול Pro נפתח בקרוב 🙂')}
          >
            <SymbolView name="crown.fill" size={13} tintColor={colors.onAccent} />
            <Text style={styles.proPillText}>שדרוג ל-Pro</Text>
          </Pressable>
        </View>

        {/* hero: the latest video as the card */}
        {session && lastThumb ? (
          <Pressable
            style={styles.heroCard}
            onPress={() => router.push('/editor')}
          >
            <Image
              source={{ uri: lastThumb }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.75)']}
              style={styles.heroScrim}
            />
            {firstLine !== '' && (
              <Text style={styles.heroCaption}>{firstLine}</Text>
            )}
            <View style={styles.heroFooter}>
              <View style={styles.heroBadge}>
                <SymbolView
                  name="checkmark.circle.fill"
                  size={13}
                  tintColor={colors.accent}
                />
                <Text style={styles.heroBadgeText}>תומלל · מוכן לעריכה</Text>
              </View>
              <View style={styles.heroPlay}>
                <SymbolView name="play.fill" size={14} tintColor={colors.onAccent} />
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={styles.heroCard}>
            <LinearGradient
              colors={['#1E1E24', '#101014']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.emptyHeroInner}>
              <View style={styles.emptyCaptionChip}>
                <Text style={styles.emptyCaptionText}>כל מילה על המסך</Text>
              </View>
              <Text style={styles.emptyHeroSub}>
                הסרטון הראשון שלך יופיע כאן —{'\n'}עם כתוביות מדויקות בעברית
                ובאנגלית
              </Text>
            </View>
          </View>
        )}

        {/* action circles */}
        <View style={styles.actionsRow}>
          <ActionCircle
            symbol="plus"
            label="סרטון חדש"
            onPress={pickAndTranscribe}
            busy={phase === 'uploading'}
          />
          <ActionCircle
            symbol="wand.and.stars"
            label="דמו עורך"
            onPress={() => router.push('/editor')}
          />
          <ActionCircle
            symbol="square.and.arrow.up"
            label="ייצוא אחרון"
            onPress={() =>
              Alert.alert('ייצוא', 'שרת הצריבה מתחבר ממש בקרוב 🎬')
            }
          />
        </View>

        {/* quick facts strip */}
        <View style={styles.factsCard}>
          <View style={styles.factRow}>
            <SymbolView name="bolt.fill" size={15} tintColor={colors.accent} />
            <Text style={styles.factText}>תמלול תוך שניות, גם עברית-אנגלית מעורבת</Text>
          </View>
          <View style={styles.factDivider} />
          <View style={styles.factRow}>
            <SymbolView name="lock.fill" size={15} tintColor={colors.accent} />
            <Text style={styles.factText}>הסרטון נמחק מהשרת עד 24 שעות</Text>
          </View>
          <View style={styles.factDivider} />
          <View style={styles.factRow}>
            <SymbolView name="textformat" size={15} tintColor={colors.accent} />
            <Text style={styles.factText}>5 סגנונות כתוביות, RTL מושלם</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  wordmark: { color: colors.text, fontSize: 26, fontFamily: fonts.black },
  proPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 36,
  },
  proPillText: {
    color: colors.onAccent,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  heroCard: {
    height: 400,
    borderRadius: radius.lg + 6,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  heroScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  heroCaption: {
    position: 'absolute',
    bottom: 70,
    left: 16,
    right: 16,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: fonts.bold,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  heroFooter: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10,10,12,0.6)',
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 32,
  },
  heroBadgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  heroPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHeroInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  emptyCaptionChip: {
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  emptyCaptionText: {
    color: colors.accent,
    fontSize: 21,
    fontFamily: fonts.bold,
  },
  emptyHeroSub: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    paddingVertical: spacing.xs,
  },
  actionItem: { alignItems: 'center', gap: 8 },
  actionCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  factsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  factRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  factText: {
    color: colors.textDim,
    fontSize: 14,
    fontFamily: fonts.regular,
  },
  factDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
