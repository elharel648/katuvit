import * as ImagePicker from 'expo-image-picker';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { uploadAndTranscribe } from '@/lib/api';
import { startSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/lib/theme';

type Phase = 'idle' | 'uploading';

/** rotating caption-style preview — shows the product before you use it */
const PREVIEW_STYLES = [
  { text: 'כתוביות שנראות ככה', color: '#FFFFFF', bg: 'transparent', outline: true },
  { text: 'או ככה, עם רקע', color: '#FFFFFF', bg: '#000000CC', outline: false },
  { text: 'גם בצהוב של ריל ויראלי', color: '#FFE23D', bg: 'transparent', outline: true },
  { text: 'and even in English', color: '#FFFFFF', bg: '#7C5CFFCC', outline: false },
];

export default function HomeScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewIdx, setPreviewIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setPreviewIdx((i) => (i + 1) % PREVIEW_STYLES.length),
      1800,
    );
    return () => clearInterval(t);
  }, []);

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

  const preview = PREVIEW_STYLES[previewIdx];

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>עברית. מדויק. מהטלפון.</Text>
        <Text style={styles.logo}>כתוביות</Text>
        <Text style={styles.tagline}>
          מעלים רילס — מקבלים כתוביות מושלמות{'\n'}גם כשעוברים באמצע ל-English
        </Text>
      </View>

      <View style={styles.previewStage}>
        <View
          style={[
            styles.previewChip,
            { backgroundColor: preview.bg },
            preview.outline && styles.previewOutline,
          ]}
        >
          <Text style={[styles.previewText, { color: preview.color }]}>
            {preview.text}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.cta,
            pressed && styles.ctaPressed,
            phase === 'uploading' && styles.ctaBusy,
          ]}
          onPress={pickAndTranscribe}
          disabled={phase === 'uploading'}
        >
          {phase === 'uploading' ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={colors.text} />
              <Text style={styles.ctaText}>מעלה ומתמלל…</Text>
            </View>
          ) : (
            <Text style={styles.ctaText}>בחר/י סרטון  →</Text>
          )}
        </Pressable>

        <Link href="/editor" asChild>
          <Pressable style={styles.ghostButton}>
            <Text style={styles.ghostText}>הצצה לעורך עם סרטון דמו</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: {
    alignItems: 'center',
    marginTop: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.accent,
    fontFamily: fonts.medium,
    fontSize: 14,
    letterSpacing: 1,
  },
  logo: { color: colors.text, fontFamily: fonts.black, fontSize: 56 },
  tagline: {
    color: colors.textDim,
    fontFamily: fonts.regular,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 26,
    marginTop: spacing.xs,
  },
  previewStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  previewChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  previewOutline: { },
  previewText: {
    fontFamily: fonts.bold,
    fontSize: 24,
    textShadowColor: '#000000',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
  actions: {
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  ctaPressed: { backgroundColor: colors.accentPressed },
  ctaBusy: { opacity: 0.75 },
  busyRow: { flexDirection: 'row-reverse', gap: 10, alignItems: 'center' },
  ctaText: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
  ghostButton: {
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostText: { color: colors.textDim, fontFamily: fonts.medium, fontSize: 14 },
});
