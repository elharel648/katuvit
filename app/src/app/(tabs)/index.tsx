import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useRef, useState } from 'react';
import Animated from 'react-native-reanimated';
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

import { track } from '@/lib/analytics';
import { startCreateFlow, useCreatePhase } from '@/lib/create-flow';
import { quotaLabel, useEntitlements } from '@/lib/entitlements';
import { ageLabel, removeSession, setCurrentSession, updateSession, useSessions, type EditingSession } from '@/lib/session';
import { updateSettings, useSettings } from '@/lib/settings';
import { accentHex } from '@/lib/templates';
import { TEMPLATES } from '@/lib/templates';
import { colors, fonts, spacing } from '@/lib/theme';

/** the product demos itself: one specimen line, cycling through real styles */
// real mid-story speech, not copy: anything "about the app" reads like an ad here
const SPECIMEN_LINES = [
  'אז אני עומד בסופר, ופתאום',
  'רגע רגע רגע, תן לי לסיים',
  'טוב, אתם לא תאמינו מה קרה לי היום',
  'ואז היא אומרת לי, בשיא הרצינות',
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

/** one recent video: thumbnail, first caption, age. tap = continue editing, long-press = remove */
function RecentCard({ session }: { session: EditingSession }) {
  useEffect(() => {
    if (session.thumbUri) return;
    VideoThumbnails.getThumbnailAsync(session.videoUri, { time: 800 })
      .then((r) => updateSession(session.id, { thumbUri: r.uri }))
      .catch(() => {});
  }, [session.id, session.thumbUri, session.videoUri]);
  const firstLine = session.lines?.[0]?.text ?? session.segments[0]?.text ?? '';
  return (
    <Pressable
      style={styles.recentCard}
      onPress={() => {
        setCurrentSession(session.id);
        track('session_reopened', { age_min: Math.round((Date.now() - session.createdAt) / 60000) });
        router.push('/editor');
      }}
      onLongPress={() =>
        Alert.alert('להסיר את הסרטון מהרשימה?', 'הייצואים שכבר שמרתם בגלריה נשארים.', [
          { text: 'ביטול', style: 'cancel' },
          { text: 'הסרה', style: 'destructive', onPress: () => removeSession(session.id) },
        ])
      }
      accessibilityRole="button"
      accessibilityLabel={`המשך עריכה: ${firstLine}`}
    >
      {session.thumbUri && <Image source={{ uri: session.thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
      <View style={styles.recentBody}>
        <Text style={styles.recentLine} numberOfLines={2}>{firstLine}</Text>
        <Text style={styles.recentAge}>{ageLabel(session)} · {Math.round(session.duration)} שנ׳</Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [specimenIdx, setSpecimenIdx] = useState(0);
  const recent = useSessions();
  const recentRef = useRef<ScrollView>(null);
  const recentOpened = useRef(false);
  // RTL slider: the first look sits at the far right, so open it scrolled to the end once
  const looksRef = useRef<ScrollView>(null);
  const looksOpened = useRef(false);
  const create = useCreatePhase();
  const ent = useEntitlements();
  const settings = useSettings();

  useEffect(() => {
    const t = setInterval(
      () => setSpecimenIdx((i) => (i + 1) % (SPECIMEN_LINES.length * TEMPLATES.length)),
      2200,
    );
    return () => clearInterval(t);
  }, []);

  const template = TEMPLATES[specimenIdx % TEMPLATES.length];
  const line = SPECIMEN_LINES[specimenIdx % SPECIMEN_LINES.length];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>כתוביות</Text>
        <Pressable onPress={() => router.push('/paywall')} accessibilityRole="button" accessibilityLabel="הסרטונים שלי">
          <BlurView intensity={30} tint="dark" style={styles.proPill}>
            <SymbolView name="crown.fill" size={13} tintColor={colors.accent} />
            <Text style={styles.proPillText}>{quotaLabel(ent) ?? '…'}</Text>
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

      {/* your videos: the new-video tile, then whatever is still editable */}
        <View style={styles.emptyHero}>
          <Text style={styles.sectionTitle}>הסרטונים שלך</Text>

          {/* the first tile is always "new video": tap it, and the live demo runs inside it */}
          <View style={styles.showcaseZone}>
            <Pressable
              style={styles.reelCard}
              onPress={() => startCreateFlow()}
              accessibilityRole="button"
              accessibilityLabel="סרטון חדש"
            >
              <LinearGradient
                colors={['#262629', '#0E0E10']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
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

              <View style={styles.newBadge}>
                <SymbolView name="plus" size={13} tintColor={colors.onAccent} />
                <Text style={styles.newBadgeText}>סרטון חדש</Text>
              </View>
            </Pressable>
          </View>

          {recent.length > 0 && (
            <>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>לאחרונה</Text>
                <Text style={styles.recentHint}>נשמרים 24 שעות</Text>
              </View>
              <ScrollView
                ref={recentRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.recentScroll}
                contentContainerStyle={styles.recentRow}
                onContentSizeChange={() => {
                  if (recentOpened.current) return;
                  recentOpened.current = true;
                  recentRef.current?.scrollToEnd({ animated: false });
                }}
              >
                {recent.map((r) => <RecentCard key={r.id} session={r} />)}
              </ScrollView>
            </>
          )}

          {/* the look the next video starts with */}
          <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>סגנון הכתוביות</Text>
          <ScrollView
            ref={looksRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToOffsets={TEMPLATES.map((_, i) => i * (LOOK_TILE_W + LOOK_GAP))}
            style={styles.looksScroll}
            contentContainerStyle={styles.looksRow}
            onContentSizeChange={() => {
              if (looksOpened.current) return;
              looksOpened.current = true;
              looksRef.current?.scrollToEnd({ animated: false });
            }}
          >
            {TEMPLATES.map((t) => {
              const active = t.id === settings.defaultStyle.template;
              const accent = accentHex(settings.defaultStyle.accent);
              return (
                <Pressable
                  key={t.id}
                  style={[styles.lookTile, active && styles.lookTileActive]}
                  onPress={() => updateSettings({ defaultStyle: { ...settings.defaultStyle, template: t.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`סגנון ${t.name}`}
                  accessibilityState={{ selected: active }}
                >
                  <View
                    style={[
                      styles.lookChip,
                      { backgroundColor: t.backgroundColor ?? 'transparent' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.lookText,
                        { color: t.textColor, textShadowColor: t.backgroundColor ? 'transparent' : t.outlineColor },
                        t.mode === 'boxword' && { backgroundColor: '#000000', borderRadius: 3, paddingHorizontal: 3 },
                      ]}
                    >
                      שלום
                    </Text>
                    <Text
                      style={[
                        styles.lookText,
                        { color: t.textColor, textShadowColor: t.backgroundColor ? 'transparent' : t.outlineColor },
                        (t.mode === 'highlight' || t.mode === 'fill' || t.mode === 'neon') && { color: accent },
                        t.mode === 'boxword' && { color: '#000000', backgroundColor: accent, borderRadius: 3, paddingHorizontal: 3 },
                        t.mode === 'reveal' && { opacity: 0.35 },
                      ]}
                    >
                      לכם
                    </Text>
                  </View>
                  <Text style={[styles.lookName, active && styles.lookNameActive]}>{t.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
    </SafeAreaView>
  );
}

const LOOK_TILE_W = 92;
const LOOK_GAP = 10;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingBottom: 124 },
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
  recentHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 10,
  },
  recentTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
  recentHint: { color: colors.textFaint, fontSize: 12, fontFamily: fonts.regular },
  recentScroll: { marginHorizontal: -spacing.md, flexGrow: 0 },
  recentRow: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: spacing.md },
  recentCard: {
    width: 104,
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
  },
  recentBody: { padding: 8, gap: 3 },
  recentLine: { color: '#FFFFFF', fontSize: 12, fontFamily: fonts.bold, textAlign: 'right', lineHeight: 15 },
  recentAge: { color: 'rgba(255,255,255,0.6)', fontSize: 10.5, fontFamily: fonts.regular, textAlign: 'right' },
  emptyHero: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.bold,
    textAlign: 'right',
    marginBottom: 2,
  },
  sectionTitleSpaced: { marginTop: 26 },
  // bleeds to the screen edges so tiles slide under the margin instead of being clipped by it
  looksScroll: { marginHorizontal: -spacing.md, marginTop: 12, flexGrow: 0 },
  looksRow: {
    flexDirection: 'row-reverse',
    gap: LOOK_GAP,
    paddingHorizontal: spacing.md,
  },
  lookTile: {
    width: LOOK_TILE_W,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  lookTileActive: { borderColor: colors.accent },
  lookChip: {
    flexDirection: 'row-reverse',
    gap: 3,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  lookText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  lookName: { color: colors.textFaint, fontSize: 12, fontFamily: fonts.regular },
  lookNameActive: { color: colors.text, fontFamily: fonts.medium },
  newBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 32,
  },
  newBadgeText: { color: colors.onAccent, fontSize: 13, fontFamily: fonts.bold },
  showcaseZone: {
    paddingTop: 14,
  },
  reelCard: {
    alignSelf: 'stretch',
    height: 230,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  reelCaption: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: 300,
  },
  reelCaptionText: {
    fontSize: 26,
    lineHeight: 34,
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
