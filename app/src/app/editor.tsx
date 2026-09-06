import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { burnAndDownload } from '@/lib/api';
import { isRtlText, previewWords, retimeWords, splitIntoLines } from '@/lib/captions';
import { getSession } from '@/lib/session';
import { CAPTION_SIZE_FONT, getSettings } from '@/lib/settings';
import { ACCENTS, ANIMATIONS, FONTS, POSITIONS, TEMPLATES, accentHex, fontFamily } from '@/lib/templates';
import { colors, fonts } from '@/lib/theme';
import type { CaptionLine, CaptionTemplate, StyleChoice, TranscriptSegment } from '@/lib/types';

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
  const [style, setStyle] = useState<StyleChoice>(() => getSettings().defaultStyle);
  const templateId = style.template;
  const setTemplateId = (id: string) => setStyle((s) => ({ ...s, template: id }));
  const [studioTab, setStudioTab] = useState<'look' | 'color' | 'font' | 'position' | 'motion'>('look');
  const accent = accentHex(style.accent);
  const previewFont = fontFamily(style.font);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string>(initialLines[0]?.id);
  const [editingLine, setEditingLine] = useState<CaptionLine | null>(null);
  const [exportPhase, setExportPhase] = useState<'idle' | 'burning' | 'done'>('idle');
  const [exportedUri, setExportedUri] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const pillScrollRef = useRef<ScrollView>(null);
  // RTL timeline: with row-reverse the FIRST line sits at the far right, but a
  // horizontal ScrollView opens at x=0 (the far left = the END of the transcript).
  const pillLayout = useRef<Record<string, { x: number; w: number }>>({});
  const [pillsViewportW, setPillsViewportW] = useState(0);
  const [pillsContentW, setPillsContentW] = useState(0);
  const didInitialScroll = useRef(false);
  const [draft, setDraft] = useState('');


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
    if (didInitialScroll.current || !pillsViewportW || pillsContentW <= pillsViewportW) return;
    didInitialScroll.current = true;
    pillScrollRef.current?.scrollToEnd({ animated: false });
  }, [pillsContentW, pillsViewportW]);

  useEffect(() => {
    const m = activeLineId ? pillLayout.current[activeLineId] : undefined;
    if (!m || !pillsViewportW) return;
    const x = Math.max(0, m.x - (pillsViewportW - m.w) / 2);
    pillScrollRef.current?.scrollTo({ x, animated: true });
  }, [activeLineId, pillsViewportW]);

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

  const exportVideo = async () => {
    if (!session) {
      Alert.alert('מצב דמו', 'בדמו אין ייצוא — העלו סרטון אמיתי עם כפתור הפלוס');
      return;
    }
    setExportPhase('burning');
    setDownloadProgress(0);
    try {
      const settings = getSettings();
      const uri = await burnAndDownload({
        mediaId: session.mediaId,
        style,
        lines: lines.map((l) => ({ start: l.start, end: l.end, text: l.text, words: l.words })),
        quality: settings.exportQuality,
        fontSize: CAPTION_SIZE_FONT[settings.captionSize],
      }, setDownloadProgress);
      // video is ready locally — success now; saving to Photos is a follow-up action
      setExportedUri(uri);
      setExportPhase('done');
      saveToPhotos(uri); // fire-and-forget; never blocks the success screen
    } catch (e) {
      setExportPhase('idle');
      Alert.alert('הייצוא נכשל', e instanceof Error ? e.message : 'נסו שוב');
    }
  };

  const [savedToPhotos, setSavedToPhotos] = useState(false);
  const saveToPhotos = async (uri: string) => {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      setSavedToPhotos(true);
    } catch {
      // simulator / permission quirks — user can still share from the success sheet
    }
  };

  // pause while editing so the active line doesn't run away under the sheet
  const openEdit = (line: CaptionLine) => {
    player.pause();
    setDraft(line.text);
    setEditingLine(line);
  };

  const closeEdit = () => {
    setEditingLine(null);
    if (videoUri) player.play();
  };

  const saveEdit = (raw: string) => {
    if (!editingLine) return;
    // one visual line per caption: newlines/tabs become spaces (the burner does the same)
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text) {
      setLines((prev) =>
        prev.map((l) =>
          l.id === editingLine.id
            ? {
                ...l,
                text,
                words: retimeWords(text, l.start, l.end, l.words),
                edited: text !== l.text || l.edited,
              }
            : l,
        ),
      );
    }
    closeEdit();
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
        <LinearGradient
          colors={['#1A2140', '#0E1220', '#0B0E17']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={styles.topScrim}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.75)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.chrome} edges={['top', 'bottom']}>
        {/* floating top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
          >
            <BlurView intensity={40} tint="dark" style={styles.roundButton}>
              <SymbolView
                name="chevron.forward"
                size={17}
                tintColor="#FFFFFF"
              />
            </BlurView>
          </Pressable>
          <BlurView intensity={25} tint="dark" style={styles.titleChip}>
            <Text style={styles.topTitle}>
              {session ? 'הסרטון שלך' : 'מצב דמו'}
            </Text>
          </BlurView>
          <View style={styles.roundButtonPlaceholder} />
        </View>

        <View style={style.position === 'top' ? styles.flexSpacerSmall : styles.flexSpacer} />

        {/* the live caption — tap to edit */}
        <Pressable
          style={[styles.captionZone, style.position === 'center' && styles.captionZoneCenter]}
          onPress={() => activeLine && openEdit(activeLine)}
          accessibilityRole="button"
          accessibilityLabel="עריכת הכתובית"
        >
          {activeLine && (
            <View style={capStyle.chip}>
              <View
                style={[
                  styles.captionWords,
                  { flexDirection: isRtlText(activeLine.text) ? 'row-reverse' : 'row' },
                ]}
              >
                {previewWords(activeLine, activeTemplate, currentTime).map((w, i) => (
                  <Text
                    key={`${activeLine.id}-${i}`}
                    style={[
                      styles.captionText,
                      capStyle.text,
                      { fontFamily: previewFont },
                      activeLine.text.length > 22 && { fontSize: 21, lineHeight: 26 },
                      w.active && activeTemplate.mode !== 'boxword' && { color: accent },
                      w.active && activeTemplate.mode === 'boxword' && {
                        color: '#000000',
                        backgroundColor: accent,
                        borderRadius: 6,
                        paddingHorizontal: 6,
                      },
                      w.active && {
                        transform: [{ scale: style.animation === 'pop' ? 1.12 : activeTemplate.activeScale }],
                      },
                    ]}
                  >
                    {w.text}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </Pressable>
        {style.position !== 'bottom' && <View style={styles.flexSpacer} />}

        {/* line timeline */}
        <ScrollView
          ref={pillScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pills}
          style={styles.pillsScroll}
          onLayout={(e) => setPillsViewportW(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setPillsContentW(w)}
        >
          {lines.map((line) => {
            const active = line.id === activeLineId;
            return (
              <Pressable
                key={line.id}
                onPress={() => seekTo(line)}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  pillLayout.current[line.id] = { x, w: width };
                }}
                accessibilityRole="button"
                accessibilityLabel={line.text}
              >
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

        {/* style studio: look · colour · font · position · motion */}
        <View style={styles.studioTabs}>
          {([
            ['look', 'לוק'],
            ['color', 'צבע'],
            ['font', 'פונט'],
            ['position', 'מיקום'],
            ['motion', 'תנועה'],
          ] as const).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setStudioTab(id)}
              style={[styles.studioTab, studioTab === id && styles.studioTabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: studioTab === id }}
            >
              <Text style={[styles.studioTabText, studioTab === id && styles.studioTabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {studioTab === 'color' && (
          <View style={styles.optionRow}>
            {ACCENTS.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setStyle((s) => ({ ...s, accent: a.id }))}
                style={[styles.swatch, { backgroundColor: a.hex }, style.accent === a.id && styles.swatchActive]}
                accessibilityRole="button"
                accessibilityLabel={a.name}
              />
            ))}
          </View>
        )}
        {studioTab === 'font' && (
          <View style={styles.optionRow}>
            {FONTS.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setStyle((s) => ({ ...s, font: f.id }))}
                style={[styles.optionChip, style.font === f.id && styles.optionChipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.optionChipText, { fontFamily: f.family }, style.font === f.id && styles.optionChipTextActive]}>
                  {f.name} · שלום
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {studioTab === 'position' && (
          <View style={styles.optionRow}>
            {POSITIONS.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => setStyle((s) => ({ ...s, position: o.id }))}
                style={[styles.optionChip, style.position === o.id && styles.optionChipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.optionChipText, style.position === o.id && styles.optionChipTextActive]}>{o.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {studioTab === 'motion' && (
          <View style={styles.optionRow}>
            {ANIMATIONS.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => setStyle((s) => ({ ...s, animation: o.id }))}
                style={[styles.optionChip, style.animation === o.id && styles.optionChipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.optionChipText, style.animation === o.id && styles.optionChipTextActive]}>{o.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {studioTab === 'look' && (
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
                accessibilityRole="button"
                accessibilityLabel={`סגנון ${t.name}`}
                accessibilityState={{ selected: active }}
              >
                <View
                  style={[
                    styles.styleCard,
                    { width: 72, height: 92 },
                    active && styles.styleCardActive,
                  ]}
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
                    <View style={[s.chip, styles.styleCardChip, styles.styleCardWords]}>
                      <Text style={[styles.styleCardText, s.text]}>שלום</Text>
                      <Text
                        style={[
                          styles.styleCardText,
                          s.text,
                          (t.mode === 'highlight' || t.mode === 'fill' || t.mode === 'neon') && { color: accent },
                          t.mode === 'boxword' && { color: '#000000', backgroundColor: accent, borderRadius: 3, paddingHorizontal: 3 },
                          t.mode === 'reveal' && { opacity: 0.35 },
                        ]}
                      >
                        לכם
                      </Text>
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
        )}

        {/* single floating action */}
        <Pressable
          style={[styles.export, exportPhase === 'burning' && styles.exportBusy]}
          onPress={exportVideo}
          disabled={exportPhase === 'burning'}
        >
          {exportPhase === 'burning' ? (
            <View style={styles.exportBusyRow}>
              <ActivityIndicator color="#0A0A0A" />
              <Text style={styles.exportText}>
                {downloadProgress > 0
                  ? `מוריד… ${Math.round(downloadProgress * 100)}%`
                  : 'צורב כתוביות…'}
              </Text>
            </View>
          ) : (
            <Text style={styles.exportText}>ייצוא הסרטון</Text>
          )}
        </Pressable>
      </SafeAreaView>

      {/* export success */}
      <Modal
        visible={exportPhase === 'done'}
        transparent
        animationType="fade"
        onRequestClose={() => setExportPhase('idle')}
      >
        <View style={styles.successBackdrop}>
          <View style={styles.successCard}>
            <Text style={styles.successEmoji}>🎬</Text>
            <Text style={styles.successTitle}>הסרטון בגלריה!</Text>
            <Text style={styles.successSub}>
              {savedToPhotos
                ? 'נשמר לגלריה · עם הכתוביות צרובות'
                : 'מוכן · עם הכתוביות צרובות'}
            </Text>
            <Pressable
              style={styles.successShare}
              onPress={() => exportedUri && Sharing.shareAsync(exportedUri)}
            >
              <Text style={styles.successShareText}>שיתוף</Text>
            </Pressable>
            {!savedToPhotos && (
              <Pressable
                style={styles.successSecondary}
                onPress={() => exportedUri && saveToPhotos(exportedUri)}
              >
                <Text style={styles.successSecondaryText}>שמירה לגלריה</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.successClose}
              onPress={() => {
                setSavedToPhotos(false);
                setExportPhase('idle');
              }}
            >
              <Text style={styles.successCloseText}>סיום</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* edit sheet */}
      <Modal
        visible={editingLine !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTap}
            onPress={closeEdit}
          />
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>תיקון שורה</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              multiline
              style={styles.sheetInput}
              textAlign="right"
              onSubmitEditing={() => saveEdit(draft)}
              blurOnSubmit
              returnKeyType="done"
              accessibilityLabel="טקסט הכתובית"
            />
            <Pressable
              style={styles.sheetSave}
              onPress={() => saveEdit(draft)}
              accessibilityRole="button"
            >
              <Text style={styles.sheetSaveText}>שמירה</Text>
            </Pressable>
            <Text style={styles.sheetHint}>הקשה מחוץ לחלון מבטלת</Text>
          </Pressable>
        </KeyboardAvoidingView>
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
  },
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 380,
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
  titleChip: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 14,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
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
  captionWords: {
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 8,
    rowGap: 2,
  },
  captionText: {
    fontSize: 26,
    lineHeight: 32,
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
  pillActive: { backgroundColor: colors.accent },
  pillText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  pillTextActive: { color: colors.onAccent, fontFamily: fonts.bold },
  editedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  styleScroll: { flexGrow: 0, marginBottom: 14 },
  styleRow: { paddingHorizontal: 16, gap: 8, flexDirection: 'row-reverse' },
  studioTabs: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  studioTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  studioTabActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  studioTabText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: fonts.medium },
  studioTabTextActive: { color: '#FFFFFF', fontFamily: fonts.bold },
  optionRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    minHeight: 92,
    marginBottom: 14,
  },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: 'transparent' },
  swatchActive: { borderColor: '#FFFFFF' },
  optionChip: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(20,20,24,0.55)',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionChipActive: { borderColor: colors.accent },
  optionChipText: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: fonts.medium },
  optionChipTextActive: { color: '#FFFFFF' },
  flexSpacerSmall: { height: 90 },
  captionZoneCenter: { justifyContent: 'center' },
  styleCardWrap: { alignItems: 'center', gap: 5 },
  styleCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#101014',
  },
  styleCardActive: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  styleCardCaption: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  styleCardChip: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  styleCardWords: { flexDirection: 'row-reverse', columnGap: 3 },
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
  },
  exportBusy: { opacity: 0.75 },
  exportBusyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  successBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successCard: {
    backgroundColor: '#131829',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  successEmoji: { fontSize: 44 },
  successTitle: { color: '#FFFFFF', fontSize: 22, fontFamily: fonts.bold },
  successSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontFamily: fonts.regular,
    marginBottom: 12,
  },
  successShare: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successShareText: { color: colors.onAccent, fontSize: 16, fontFamily: fonts.bold },
  successSecondary: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successSecondaryText: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.medium,
  },
  successClose: {
    alignSelf: 'stretch',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCloseText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontFamily: fonts.medium,
  },
  exportText: { color: '#0A0A0A', fontSize: 16, fontFamily: fonts.bold },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetBackdropTap: { flex: 1 },
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
  sheetSave: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSaveText: { color: colors.onAccent, fontSize: 16, fontFamily: fonts.bold },
  sheetHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
});
