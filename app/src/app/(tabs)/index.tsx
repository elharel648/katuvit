import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';
import Animated from 'react-native-reanimated';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSession } from '@/lib/session';
import { TEMPLATES } from '@/lib/templates';
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
        <Pressable onPress={() => Alert.alert('Pro', 'מסלול Pro נפתח בקרוב')}>
          <BlurView intensity={30} tint="dark" style={styles.proPill}>
            <SymbolView name="crown.fill" size={13} tintColor={colors.accent} />
            <Text style={styles.proPillText}>Pro</Text>
          </BlurView>
        </Pressable>
      </View>

      {/* hero */}
      {session && lastThumb ? (
        <Pressable style={styles.hero} onPress={() => router.push('/editor')}>
          <Image
            source={{ uri: lastThumb }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
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
        <View style={styles.hero}>
          {/* ambient backdrop */}
          <LinearGradient
            colors={['#161C33', '#0E1220', '#0B0E17']}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* warm glow blob behind the card */}
          <View style={styles.glowBlob} pointerEvents="none" />

          {/* the showcase: a reel card with captions, floating with depth */}
          <View style={styles.showcaseZone}>
            {/* back card peeking for depth */}
            <View style={styles.reelCardBack} />

            {/* front reel card */}
            <View style={styles.reelCard}>
              <LinearGradient
                colors={['#2A2350', '#3A2A4E', '#1A1830']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {/* abstract creator avatar */}
              <View style={styles.avatarGlow}>
                <LinearGradient
                  colors={['#FFD52E', '#FF9E2E']}
                  style={styles.avatarInner}
                >
                  <SymbolView name="person.fill" size={30} tintColor="#1A1830" />
                </LinearGradient>
              </View>

              {/* audio waveform — the core: voice becomes captions */}
              <View style={styles.waveRow}>
                {WAVE_BARS.map((h, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      { height: h },
                      {
                        animationName: wavePulse,
                        animationDuration: '900ms',
                        animationDelay: `${i * 70}ms`,
                        animationIterationCount: 'infinite',
                        animationTimingFunction: 'ease-in-out',
                      },
                    ]}
                  />
                ))}
              </View>

              {/* the live caption, karaoke word-by-word */}
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

            {/* floating glass chips for depth */}
            <BlurView intensity={30} tint="dark" style={[styles.floatChip, styles.floatChipTop]}>
              <View style={styles.dotLive} />
              <Text style={styles.floatChipText}>עברית + English</Text>
            </BlurView>
            <BlurView intensity={30} tint="dark" style={[styles.floatChip, styles.floatChipBottom]}>
              <SymbolView name="checkmark" size={11} tintColor={colors.accent} />
              <Text style={styles.floatChipText}>סגנון · {template.name}</Text>
            </BlurView>
          </View>

          <Pressable
            style={styles.demoLink}
            onPress={() => router.push('/editor')}
          >
            <Text style={styles.demoLinkText}>אין סרטון ביד? נסו את הדמו</Text>
          </Pressable>
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
  hero: {
    flex: 1,
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
  glowBlob: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,213,46,0.10)',
    // soft radial-ish glow via large blur substitute
    opacity: 0.9,
  },
  showcaseZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelCardBack: {
    position: 'absolute',
    width: 190,
    height: 320,
    borderRadius: 26,
    backgroundColor: '#20263F',
    transform: [{ rotate: '-8deg' }, { translateX: 26 }],
    opacity: 0.6,
  },
  reelCard: {
    width: 210,
    height: 356,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 26,
    transform: [{ rotate: '3deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarGlow: {
    position: 'absolute',
    top: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveRow: {
    position: 'absolute',
    top: 168,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,213,46,0.85)',
  },
  reelCaption: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 180,
  },
  reelCaptionText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    textAlign: 'center',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  floatChip: {
    position: 'absolute',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 34,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  floatChipTop: { top: '20%', left: 24, transform: [{ rotate: '-4deg' }] },
  floatChipBottom: { bottom: '20%', right: 20, transform: [{ rotate: '4deg' }] },
  floatChipText: { color: '#FFFFFF', fontSize: 12, fontFamily: fonts.medium },
  dotLive: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
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
