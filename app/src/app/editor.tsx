import * as VideoThumbnails from 'expo-video-thumbnails';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import demoTranscript from '@/fixtures/transcript-demo.json';
import { formatTime, splitIntoLines } from '@/lib/captions';
import { getSession } from '@/lib/session';
import { TEMPLATES } from '@/lib/templates';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import type { CaptionLine, TranscriptSegment } from '@/lib/types';

export default function EditorScreen() {
  const session = getSession();

  const initialLines = useMemo(() => {
    const segments =
      session?.segments ?? (demoTranscript as TranscriptSegment[]);
    return splitIntoLines(segments);
  }, [session]);

  const [lines, setLines] = useState<CaptionLine[]>(initialLines);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.videoUri) return;
    VideoThumbnails.getThumbnailAsync(session.videoUri, { time: 500 })
      .then((r) => setThumbnail(r.uri))
      .catch(() => {});
  }, [session?.videoUri]);

  const editLine = (id: string, text: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, text, edited: true } : l)),
    );
  };

  const activeTemplate = TEMPLATES.find((t) => t.id === templateId)!;
  const editedCount = lines.filter((l) => l.edited).length;
  const durationLabel = session
    ? `${Math.round(session.duration)} שניות`
    : 'סרטון דמו';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* header: back + video context */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>עריכת כתוביות</Text>
          <Text style={styles.subtitle}>
            {durationLabel} · {lines.length} שורות
            {editedCount > 0 ? ` · ${editedCount} תוקנו` : ''}
          </Text>
        </View>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbGlyph}>🎬</Text>
          </View>
        )}
      </View>

      {/* live style preview of the active template */}
      <View style={styles.previewBar}>
        <View
          style={[
            styles.previewChip,
            {
              backgroundColor:
                activeTemplate.backgroundColor ?? 'transparent',
            },
          ]}
        >
          <Text
            style={[
              styles.previewText,
              {
                color: activeTemplate.textColor,
                textShadowColor: activeTemplate.outlineColor,
              },
            ]}
          >
            {lines[0]?.text ?? 'תצוגה מקדימה'}
          </Text>
        </View>
      </View>

      <FlatList
        data={lines}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.lineRow}>
            <TextInput
              value={item.text}
              onChangeText={(t) => editLine(item.id, t)}
              style={styles.lineInput}
              multiline
              textAlign="right"
            />
            <View style={styles.lineMeta}>
              <Text style={styles.timeText}>{formatTime(item.start)}</Text>
              {item.edited && <View style={styles.editedDot} />}
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <FlatList
          horizontal
          inverted
          data={TEMPLATES}
          keyExtractor={(t) => t.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.templates}
          renderItem={({ item }) => {
            const active = templateId === item.id;
            return (
              <Pressable
                onPress={() => setTemplateId(item.id)}
                style={[styles.templateChip, active && styles.templateActive]}
              >
                <View
                  style={[
                    styles.templateSwatch,
                    { backgroundColor: item.backgroundColor ?? '#00000055' },
                  ]}
                >
                  <Text
                    style={[
                      styles.templateGlyph,
                      {
                        color: item.textColor,
                        textShadowColor: item.outlineColor,
                      },
                    ]}
                  >
                    אב
                  </Text>
                </View>
                <Text
                  style={[styles.templateName, active && styles.templateNameActive]}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
        <Pressable style={styles.export} disabled>
          <Text style={styles.exportText}>ייצוא סרטון עם כתוביות</Text>
          <Text style={styles.exportHint}>בקרוב — מתחבר לשרת הצריבה</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  back: {
    color: colors.textDim,
    fontSize: 34,
    fontFamily: fonts.regular,
    transform: [{ scaleX: -1 }],
    marginTop: -4,
  },
  headerText: { flex: 1, alignItems: 'flex-end' },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 20 },
  subtitle: {
    color: colors.textFaint,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  thumb: {
    width: 44,
    height: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbGlyph: { fontSize: 20 },
  previewBar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
  },
  previewChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    maxWidth: '90%',
  },
  previewText: {
    fontFamily: fonts.bold,
    fontSize: 18,
    textAlign: 'center',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: 8 },
  lineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  lineInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 24,
    padding: 0,
    writingDirection: 'rtl',
  },
  lineMeta: { alignItems: 'center', gap: 4, width: 44 },
  timeText: {
    color: colors.textFaint,
    fontFamily: fonts.regular,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  editedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  templates: { paddingHorizontal: spacing.md, gap: spacing.sm },
  templateChip: { alignItems: 'center', gap: 4, opacity: 0.55 },
  templateActive: { opacity: 1 },
  templateSwatch: {
    width: 62,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  templateGlyph: {
    fontFamily: fonts.bold,
    fontSize: 18,
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  templateName: {
    color: colors.textDim,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  templateNameActive: { color: colors.text, fontFamily: fonts.medium },
  export: {
    marginHorizontal: spacing.md,
    marginBottom: 4,
    backgroundColor: colors.accent,
    opacity: 0.5,
    borderRadius: radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
  },
  exportText: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  exportHint: {
    color: '#FFFFFF99',
    fontFamily: fonts.regular,
    fontSize: 11,
    marginTop: 1,
  },
});
