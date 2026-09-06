import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';
import Animated from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreatePhase } from '@/lib/create-flow';
import { quotaLabel, useEntitlements } from '@/lib/entitlements';
import { getSession } from '@/lib/session';
import { TEMPLATES } from '@/lib/templates';
import { HeroAvatar } from '@/components/HeroAvatar';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/** the product demos itself: one specimen line, cycling through real styles */
const SPECIMEN_LINES = [
  'טוב חברים, יש לי משהו להגיד לכם',
  'אף אחד לא מספר לכם את זה',
  'וזה היה honestly הדבר הכי נכון שעשיתי',
  'תעצרו הכל, תקשיבו לזה רגע',
];

/** karaoke: each word pops in sequence, like live captions */
const wordIn = {
  '0%': { opacity: 0, transform: [{ translateY: 14 }, { scale: 0.9 }] },
  '100%': { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
};

const breathe = {
  '0%': { transform: [{ scale: 1 }] },
  '50%': { transform: [{ scale: 1.045 }] },
  '100%': { transform: [{ scale: 1 }] },
};

const wavePulse = {
  '0%': { transform: [{ scaleY: 0.5 }] },
  '50%': { transform: [{ scaleY: 1 }] },
  '100%': { transform: [{ scaleY: 0.5 }] },
};

const WAVE_BARS = [14, 26, 18, 34, 22, 40, 28, 20, 32, 16, 30, 24];

export default function HomeScreen() {
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const [specimenIdx, setSpecimenIdx] = useState(0);
  const session = getSession();
  const create = useCreatePhase();
  const ent = useEntitlements();

  useEffect(() => {
    const t = setInterval(
      () => setSpecimenIdx((i) => (i + 1) % (SPECIMEN_LINES.length * TEMPLATES.length)),
      2200,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!session?.videoUri) return;
    VideoThumbnails.getThumbnailAsync(session.videoUri, { time: 800 })
      .then((r) => setLastThumb(r.uri))
      .catch(() => {});
  }, [session?.videoUri]);

  const template = TEMPLATES[specimenIdx % TEMPLATES.length];
  const line = SPECIMEN_LINES[specimenIdx % SPECIMEN_LINES.length];
  const firstLine = session?.segments?.[0]?.text ?? '';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>כתוביות</Text>
        <Pressable onPress={() => router.push('/paywall')} accessibilityRole="button" accessibilityLabel="הסרטונים שלי">
          <BlurView intensity={30} tint="dark" style={styles.proPill}>
            <SymbolView name="crown.fill" size={13} tintColor={colors.accent} />
            <Text style={styles.proPillText}>{quotaLabel(ent) ?? 'Pro'}</Text>
          </BlurView>
        </Pressable>
      </View>

      {create.phase !== 'idle' && (
        <View style={styles.statusPill} accessibilityLiveRegion="polite">
          {create.phase === 'uploading' ? (
            <>
              <Text style={styles.statusPct}>{Math.round(create.progress * 100)}%</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(create.progress * 100)}%` }]} />
              </View>
              <Text style={styles.statusText}>מעלים את הסרטון</Text>
            </>
          ) : (
            <>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.statusText}>מתמללים… בדרך כלל חצי דקה</Text>
            </>
          )}
        </View>
      )}

      {/* hero */}
      {session ? (
        <Pressable style={styles.hero} onPress={() => router.push('/editor')}>
          {lastThumb && (
            <Image
              source={{ uri: lastThumb }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
          <LinearGradient
            colors={['rgba(11,14,23,0.1)', 'rgba(11,14,23,0.88)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            {firstLine !== '' && (
              <Text style={styles.heroCaptionOnVideo}>{firstLine}</Text>
            )}
            <View style={styles.heroMetaRow}>
              <BlurView intensity={25} tint="dark" style={styles.glassChip}>
                <SymbolView
                  name="checkmark.circle.fill"
                  size={13}
                  tintColor={colors.accent}
                />
                <Text style={styles.glassChipText}>
                  תומלל · {Math.round(session.duration)} שניות
                </Text>
              </BlurView>
              <Text style={styles.heroLink}>המשך עריכה ‹</Text>
            </View>
          </View>
        </Pressable>
      ) : (
        <View style={styles.emptyHero}>
          {/* one message, real spoken Hebrew */}
          <View style={styles.headlineBlock}>
            <Text style={styles.headline}>תדברו.{'\n'}אנחנו נכתוב.</Text>
            <Text style={styles.subline}>
              כתוביות מדויקות לכל סרטון. עברית ואנגלית באותה נשימה.
            </Text>
          </View>

          {/* one visual: the reel card, straight and quiet */}
          <View style={styles.showcaseZone}>
            <View style={styles.reelCard}>
              <LinearGradient
                colors={['#241F45', '#1B1836', '#12101F']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.avatarGlow}>
                <View style={styles.avatarRing}>
                  <HeroAvatar size={150} />
                </View>
              </View>

              <View style={styles.waveRow}>
                {WAVE_BARS.slice(2, 10).map((h, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      { height: h },
                      {
                        animationName: wavePulse,
                        animationDuration: '900ms',
                        animationDelay: `${i * 80}ms`,
                        animationIterationCount: 'infinite',
                        animationTimingFunction: 'ease-in-out',
                      },
                    ]}
                  />
                ))}
              </View>

              <View
                style={[
                  styles.reelCaption,
                  { backgroundColor: template.backgroundColor ?? 'transparent' },
                ]}
              >
                <View style={styles.wordsRow}>
                  {line.split(' ').map((w, i) => (
                    <Animated.Text
                      key={`${specimenIdx}-${i}`}
                      style={[
                        styles.reelCaptionText,
                        {
                          color: template.textColor,
                          textShadowColor: template.backgroundColor
                            ? 'transparent'
                            : template.outlineColor,
                        },
                        {
                          animationName: wordIn,
                          animationDuration: '360ms',
                          animationDelay: `${i * 150}ms`,
                          animationFillMode: 'backwards',
                          animationTimingFunction: 'ease-out',
                        },
                      ]}
                    >
                      {w}
                    </Animated.Text>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingBottom: 96 },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  wordmark: { color: colors.text, fontSize: 24, fontFamily: fonts.black },
  proPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 34,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  proPillText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  statusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statusText: { color: colors.textDim, fontSize: 13, fontFamily: fonts.medium },
  statusPct: { color: colors.accent, fontSize: 13, fontFamily: fonts.bold, minWidth: 38, textAlign: 'left' },
  progressTrack: {
    width: 110,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    flexDirection: 'row-reverse',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  hero: {
    flex: 1,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg + 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  heroContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
    gap: spacing.md,
  },
  heroCaptionOnVideo: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: fonts.bold,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
    marginBottom: spacing.sm,
  },
  heroMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  glassChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 32,
    overflow: 'hidden',
  },
  glassChipText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  heroLink: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  emptyHero: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headlineBlock: {
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  headline: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: fonts.black,
    textAlign: 'right',
  },
  subline: {
    color: colors.textDim,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    textAlign: 'right',
    maxWidth: 300,
  },
  showcaseZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.md,
  },
  reelCard: {
    width: 232,
    height: 372,
    borderRadius: 30,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  avatarGlow: {
    position: 'absolute',
    top: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: 158,
    height: 158,
    borderRadius: 79,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  waveRow: {
    position: 'absolute',
    top: 222,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,213,46,0.7)',
  },
  reelCaption: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 200,
  },
  reelCaptionText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    textAlign: 'center',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  demoLink: {
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 18,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoLinkText: { color: colors.textDim, fontSize: 13, fontFamily: fonts.medium },
  wordsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 9,
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: fonts.regular,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },
});
