import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/lib/theme';

export default function ProjectsScreen() {
  const session = getSession();
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.videoUri) return;
    VideoThumbnails.getThumbnailAsync(session.videoUri, { time: 800 })
      .then((r) => setThumb(r.uri))
      .catch(() => {});
  }, [session?.videoUri]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>הסרטונים שלי</Text>

      {session && thumb ? (
        <Pressable style={styles.row} onPress={() => router.push('/editor')}>
          <Image source={{ uri: thumb }} style={styles.rowThumb} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {session.segments[0]?.text ?? 'סרטון'}
            </Text>
            <Text style={styles.rowMeta}>
              {Math.round(session.duration)} שניות ·{' '}
              {session.segments.length} קטעים
            </Text>
          </View>
          <SymbolView
            name="chevron.left"
            size={15}
            tintColor={colors.textFaint}
          />
        </Pressable>
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <SymbolView name="film" size={28} tintColor={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>עוד אין סרטונים</Text>
          <Text style={styles.emptySub}>
            הסרטונים שתעבדו עליהם יופיעו כאן.
          </Text>
          <Pressable
            style={styles.demoButton}
            onPress={() => router.push('/editor')}
          >
            <Text style={styles.demoButtonText}>אין סרטון ביד? נסו את הדמו</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: 26, fontFamily: fonts.black },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  rowThumb: {
    width: 56,
    height: 74,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  rowBody: { flex: 1, gap: 4, alignItems: 'flex-end' },
  rowTitle: { color: colors.text, fontSize: 16, fontFamily: fonts.medium },
  rowMeta: { color: colors.textFaint, fontSize: 13, fontFamily: fonts.regular },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontFamily: fonts.bold },
  demoButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 20,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoButtonText: {
    color: colors.textDim,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  emptySub: {
    color: colors.textFaint,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
});
