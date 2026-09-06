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
          {/* cinematic backdrop: layered gradients, no dead flat box */}
          <LinearGradient
            colors={['#1A2140', '#0E1220', '#0B0E17']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', 'rgba(255,213,46,0.05)', 'transparent']}
            start={{ x: 0, y: 0.3 }}
            end={{ x: 1, y: 0.7 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.specimenZone}>
            <View
              style={[
                styles.specimenChip,
                {
                  backgroundColor: template.backgroundColor ?? 'transparent',
                },
              ]}
            >
              <View style={styles.wordsRow}>
                {line.split(' ').map((w, i) => (
                  <Animated.Text
                    key={`${specimenIdx}-${i}`}
                    style={[
                      styles.specimenText,
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
            <Text style={styles.specimenStyleName}>סגנון · {template.name}</Text>
            <Pressable
              style={styles.demoLink}
              onPress={() => router.push('/editor')}
            >
              <Text style={styles.demoLinkText}>אין סרטון ביד? נסו את הדמו</Text>
            </Pressable>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
  specimenZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: spacing.lg,
  },
  wordsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 9,
  },
  ghostChipTop: {
    top: '20%',
    right: '12%',
    transform: [{ rotate: '6deg' }],
  },
  ghostChipBottom: {
    bottom: '18%',
    left: '10%',
    transform: [{ rotate: '-7deg' }],
  },
  specimenChip: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  specimenText: {
    fontSize: 27,
    fontFamily: fonts.bold,
    textAlign: 'center',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
  demoLink: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 18,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoLinkText: {
    color: colors.textDim,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  specimenStyleName: {
    color: colors.textFaint,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  heroFootnoteWrap: {
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  heroFootnote: {
    color: colors.textFaint,
    fontSize: 12,
    fontFamily: fonts.regular,
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: fonts.regular,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },
});
