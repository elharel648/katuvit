import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import demoTranscript from '@/fixtures/transcript-demo.json';
import { splitIntoLines } from '@/lib/captions';
import { getSession } from '@/lib/session';
import { TEMPLATES } from '@/lib/templates';
import { fonts } from '@/lib/theme';
import type { CaptionLine, CaptionTemplate, TranscriptSegment } from '@/lib/types';

/** how the active caption is painted on the video, per template */
function captionStyleFor(t: CaptionTemplate) {
  return {
    chip: {
      backgroundColor: t.backgroundColor ?? 'transparent',
      borderRadius: 10,
      paddingHorizontal: t.backgroundColor ? 14 : 4,
      paddingVertical: t.backgroundColor ? 6 : 0,
    },
    text: {
      color: t.textColor,
      textShadowColor: t.backgroundColor ? 'transparent' : t.outlineColor,
      textShadowRadius: t.backgroundColor ? 0 : 8,
      textShadowOffset: { width: 0, height: 2 },
    },
  };
}

export default function EditorScreen() {
  const session = getSession();
  const videoUri = session?.videoUri ?? null;

  const initialLines = useMemo(() => {
    const segments =
      session?.segments ?? (demoTranscript as TranscriptSegment[]);
    return splitIntoLines(segments);
  }, [session]);

  const [lines, setLines] = useState<CaptionLine[]>(initialLines);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string>(initialLines[0]?.id);
  const [editingLine, setEditingLine] = useState<CaptionLine | null>(null);

  const pillScrollRef = useRef<ScrollView>(null);

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.15;
    p.play();
  });
  useEvent(player, 'timeUpdate');
  const currentTime = player.currentTime;

  // active line follows playback
  useEffect(() => {
    const active =
      lines.find((l) => currentTime >= l.start && currentTime < l.end + 0.15) ??
      null;
    if (active && active.id !== activeLineId) setActiveLineId(active.id);
  }, [currentTime, lines, activeLineId]);

  useEffect(() => {
    if (!videoUri) return;
    VideoThumbnails.getThumbnailAsync(videoUri, { time: 800 })
      .then((r) => setThumbnail(r.uri))
      .catch(() => {});
  }, [videoUri]);

  const activeTemplate = TEMPLATES.find((t) => t.id === templateId)!;
  const capStyle = captionStyleFor(activeTemplate);
  const activeLine = lines.find((l) => l.id === activeLineId) ?? null;

  const seekTo = (line: CaptionLine) => {
    player.currentTime = line.start;
    setActiveLineId(line.id);
    if (!player.playing) player.play();
  };

  const saveEdit = (text: string) => {
    if (!editingLine) return;
    setLines((prev) =>
      prev.map((l) =>
        l.id === editingLine.id ? { ...l, text, edited: true } : l,
      ),
    );
    setEditingLine(null);
  };

  return (
    <View style={styles.screen}>
      {/* the video IS the interface */}
      {videoUri ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.demoBackdrop]} />
      )}
      <View style={styles.topScrim} pointerEvents="none" />
      <View style={styles.bottomScrim} pointerEvents="none" />

      <SafeAreaView style={styles.chrome} edges={['top', 'bottom']}>
        {/* floating top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()}>
            <BlurView intensity={40} tint="dark" style={styles.roundButton}>
              <Text style={styles.backGlyph}>‹</Text>
            </BlurView>
          </Pressable>
          <Text style={styles.topTitle}>
            {session ? 'הסרטון שלך' : 'סרטון דמו'}
          </Text>
          <View style={styles.roundButtonPlaceholder} />
        </View>

        <View style={styles.flexSpacer} />

        {/* the live caption — tap to edit */}
        <Pressable
          style={styles.captionZone}
          onPress={() => activeLine && setEditingLine(activeLine)}
        >
          {activeLine && (
            <View style={capStyle.chip}>
              <Text style={[styles.captionText, capStyle.text]}>
                {activeLine.text}
              </Text>
            </View>
          )}
        </Pressable>

        {/* line timeline */}
        <ScrollView
          ref={pillScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pills}
          style={styles.pillsScroll}
        >
          {lines.map((line) => {
            const active = line.id === activeLineId;
            return (
              <Pressable key={line.id} onPress={() => seekTo(line)}>
                <BlurView
                  intensity={active ? 0 : 30}
                  tint="dark"
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text
                    style={[styles.pillText, active && styles.pillTextActive]}
                    numberOfLines={1}
                  >
                    {line.text}
                  </Text>
                  {line.edited && <View style={styles.editedDot} />}
                </BlurView>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* style cards: your frame, each style on it */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.styleRow}
          style={styles.styleScroll}
        >
          {TEMPLATES.map((t) => {
            const active = t.id === templateId;
            const s = captionStyleFor(t);
            return (
              <Pressable
                key={t.id}
                onPress={() => setTemplateId(t.id)}
                style={styles.styleCardWrap}
              >
                <View
                  style={[styles.styleCard, active && styles.styleCardActive]}
                >
                  {thumbnail ? (
                    <Image
                      source={{ uri: thumbnail }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={[StyleSheet.absoluteFill, styles.demoBackdrop]}
                    />
                  )}
                  <View style={styles.styleCardCaption}>
                    <View style={[s.chip, styles.styleCardChip]}>
                      <Text style={[styles.styleCardText, s.text]}>שלום</Text>
                    </View>
                  </View>
                </View>
                <Text
                  style={[styles.styleName, active && styles.styleNameActive]}
                >
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* single floating action */}
        <Pressable style={styles.export} disabled>
          <Text style={styles.exportText}>ייצוא הסרטון</Text>
        </Pressable>
      </SafeAreaView>

      {/* edit sheet */}
      <Modal
        visible={editingLine !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingLine(null)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setEditingLine(null)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>תיקון שורה</Text>
            <TextInput
              defaultValue={editingLine?.text}
              autoFocus
              multiline
              style={styles.sheetInput}
              textAlign="right"
              onSubmitEditing={(e) => saveEdit(e.nativeEvent.text)}
              blurOnSubmit
              returnKeyType="done"
            />
            <Text style={styles.sheetHint}>אנטר לשמירה · הקשה בחוץ לביטול</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  demoBackdrop: { backgroundColor: '#101014' },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'transparent',
  },
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 360,
    backgroundColor: 'rgba(0,0,0,0.001)',
  },
  chrome: { flex: 1 },
  topBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,24,0.35)',
  },
  roundButtonPlaceholder: { width: 44, height: 44 },
  backGlyph: {
    color: '#FFFFFF',
    fontSize: 30,
    fontFamily: fonts.regular,
    transform: [{ scaleX: -1 }],
    marginTop: -3,
  },
  topTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  flexSpacer: { flex: 1 },
  captionZone: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 64,
    paddingHorizontal: 24,
    marginBottom: 14,
  },
  captionText: {
    fontSize: 26,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  pillsScroll: { flexGrow: 0, marginBottom: 12 },
  pills: { paddingHorizontal: 16, gap: 6, flexDirection: 'row-reverse' },
  pill: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'rgba(20,20,24,0.45)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    maxWidth: 200,
  },
  pillActive: { backgroundColor: '#7C5CFF' },
  pillText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  pillTextActive: { color: '#FFFFFF', fontFamily: fonts.bold },
  editedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  styleScroll: { flexGrow: 0, marginBottom: 14 },
  styleRow: { paddingHorizontal: 16, gap: 10, flexDirection: 'row-reverse' },
  styleCardWrap: { alignItems: 'center', gap: 5 },
  styleCard: {
    width: 74,
    height: 98,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#101014',
  },
  styleCardActive: {
    borderWidth: 2,
    borderColor: '#9B82FF',
  },
  styleCardCaption: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  styleCardChip: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  styleCardText: { fontSize: 11, fontFamily: fonts.bold },
  styleName: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: fonts.regular,
  },
  styleNameActive: { color: '#FFFFFF', fontFamily: fonts.medium },
  export: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.55,
  },
  exportText: { color: '#0A0A0A', fontSize: 16, fontFamily: fonts.bold },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#141418',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
    gap: 12,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: fonts.bold,
    textAlign: 'right',
  },
  sheetInput: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: fonts.medium,
    backgroundColor: '#1E1E24',
    borderRadius: 14,
    padding: 16,
    minHeight: 60,
    writingDirection: 'rtl',
  },
  sheetHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
});
