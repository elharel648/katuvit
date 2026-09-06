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
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import demoTranscript from '@/fixtures/transcript-demo.json';
import { burnAndDownload } from '@/lib/api';
import {
  deleteLine,
  isRtlText,
  mergeWithNext,
  nudgeLine,
  previewWords,
  removeFillers,
  retext,
  retimeWords,
  splitIntoLines,
  splitLine,
  suggestEmoji,
  toggleEmoji,
  toggleEmphasis,
} from '@/lib/captions';
import { getSession } from '@/lib/session';
import { CAPTION_SIZE_FONT, CAPTION_SIZE_LABELS, getSettings, type CaptionSize } from '@/lib/settings';
import { ACCENTS, ANIMATIONS, FONTS, POSITIONS, PRESET_Y, TEMPLATES, accentHex, fontFamily } from '@/lib/templates';
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

  const [lines, setLinesRaw] = useState<CaptionLine[]>(initialLines);
  const historyRef = useRef<CaptionLine[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  /** every edit goes through here so it can be undone */
  const commit = (next: CaptionLine[] | ((prev: CaptionLine[]) => CaptionLine[])) => {
    setLinesRaw((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (value !== prev) {
        historyRef.current = [...historyRef.current.slice(-30), prev];
        setCanUndo(true);
      }
      return value;
    });
  };
  const undo = () => {
    const prev = historyRef.current.pop();
    if (prev) setLinesRaw(prev);
    setCanUndo(historyRef.current.length > 0);
  };
  const [captionSize, setCaptionSize] = useState<CaptionSize>(() => getSettings().captionSize);
  const [style, setStyle] = useState<StyleChoice>(() => getSettings().defaultStyle);
  const templateId = style.template;
  const setTemplateId = (id: string) => setStyle((s) => ({ ...s, template: id }));
  const [studioTab, setStudioTab] = useState<'look' | 'color' | 'font' | 'position' | 'motion' | 'size'>('look');
  const accent = accentHex(style.accent);
  const previewFont = fontFamily(style.font);

  // --- where the video actually is on screen (contain) so drag positions map 1:1 to the burn ---
  const [screen, setScreen] = useState({ w: 0, h: 0 });
  const [videoAspect, setVideoAspect] = useState(9 / 16);
  const rect = useMemo(() => {
    const { w, h } = screen;
    if (!w || !h) return { x: 0, y: 0, w: 0, h: 0 };
    if (videoAspect < w / h) {
      const rw = h * videoAspect;
      return { x: (w - rw) / 2, y: 0, w: rw, h };
    }
    const rh = w / videoAspect;
    return { x: 0, y: (h - rh) / 2, w, h: rh };
  }, [screen, videoAspect]);

  // caption centre in screen pixels (shared with the UI thread for a smooth drag)
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);
  const chipW = useSharedValue(0);
  const chipH = useSharedValue(0);
  const dragStart = useSharedValue({ x: 0, y: 0 });

  useEffect(() => {
    if (!rect.w) return;
    const fx = style.position === 'custom' ? style.posX ?? 0.5 : 0.5;
    const fy = style.position === 'custom' ? style.posY ?? 0.75 : PRESET_Y[style.position];
    cx.value = rect.x + fx * rect.w;
    cy.value = rect.y + fy * rect.h;
  }, [rect, style.position, style.posX, style.posY, cx, cy]);

  const commitDrag = (fx: number, fy: number) =>
    setStyle((s) => ({ ...s, position: 'custom', posX: fx, posY: fy }));
  const openActive = () => {
    if (activeLineRef.current) openEdit(activeLineRef.current);
  };

  const captionGesture = useMemo(() => {
    const pad = 24;
    const pan = Gesture.Pan()
      .onStart(() => {
        dragStart.value = { x: cx.value, y: cy.value };
      })
      .onUpdate((e) => {
        cx.value = Math.min(Math.max(dragStart.value.x + e.translationX, rect.x + pad), rect.x + rect.w - pad);
        cy.value = Math.min(Math.max(dragStart.value.y + e.translationY, rect.y + pad), rect.y + rect.h - pad);
      })
      .onEnd(() => {
        const fx = (cx.value - rect.x) / rect.w;
        const fy = (cy.value - rect.y) / rect.h;
        runOnJS(commitDrag)(Math.round(fx * 1000) / 1000, Math.round(fy * 1000) / 1000);
      });
    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(openActive)();
    });
    return Gesture.Race(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect]);

  const captionAnimated = useAnimatedStyle(() => ({
    transform: [{ translateX: cx.value - chipW.value / 2 }, { translateY: cy.value - chipH.value / 2 }],
  }));
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
      .then((r) => {
        setThumbnail(r.uri);
        if (r.width && r.height) setVideoAspect(r.width / r.height);
      })
      .catch(() => {});
  }, [videoUri]);

  const activeTemplate = TEMPLATES.find((t) => t.id === templateId)!;
  const capStyle = captionStyleFor(activeTemplate);
  const activeLine = lines.find((l) => l.id === activeLineId) ?? null;
  const activeLineRef = useRef<CaptionLine | null>(null);
  activeLineRef.current = activeLine;

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
        fontSize: CAPTION_SIZE_FONT[captionSize],
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
      commit((prev) =>
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

  /** the sheet always edits the live copy of the line (it may have changed under it) */
  const sheetLine = editingLine ? lines.find((l) => l.id === editingLine.id) ?? null : null;

  const doDelete = () => {
    if (!editingLine) return;
    commit((prev) => deleteLine(prev, editingLine.id));
    closeEdit();
  };
  const doSplit = () => {
    if (!editingLine) return;
    commit((prev) => splitLine(prev, editingLine.id));
    closeEdit();
  };
  const doMerge = () => {
    if (!editingLine) return;
    commit((prev) => mergeWithNext(prev, editingLine.id));
    closeEdit();
  };
  const doNudge = (delta: number) => {
    if (!editingLine) return;
    commit((prev) => nudgeLine(prev, editingLine.id, delta));
  };
  const doCleanFillers = () => {
    let removed = 0;
    commit((prev) => {
      const r = removeFillers(prev);
      removed = r.removed;
      return r.removed ? r.lines : prev;
    });
    setTimeout(() => Alert.alert(removed ? `הוסרו ${removed} מילות מילוי` : 'אין מילות מילוי', ''), 50);
  };

  return (
    <View style={styles.screen} onLayout={(e) => setScreen({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* the video IS the interface */}
      {videoUri ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
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
          <View style={styles.topActions}>
            <Pressable onPress={doCleanFillers} hitSlop={8} accessibilityRole="button" accessibilityLabel="ניקוי מילות מילוי">
              <BlurView intensity={40} tint="dark" style={styles.roundButton}>
                <SymbolView name="sparkles" size={16} tintColor="#FFFFFF" />
              </BlurView>
            </Pressable>
            <Pressable onPress={undo} disabled={!canUndo} hitSlop={8} accessibilityRole="button" accessibilityLabel="ביטול">
              <BlurView intensity={40} tint="dark" style={[styles.roundButton, !canUndo && styles.roundButtonDisabled]}>
                <SymbolView name="arrow.uturn.backward" size={16} tintColor="#FFFFFF" />
              </BlurView>
            </Pressable>
          </View>
        </View>

        <View style={styles.flexSpacer} />

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
            ['size', 'גודל'],
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
            <View style={[styles.optionChip, style.position === 'custom' && styles.optionChipActive]}>
              <Text style={[styles.optionChipText, style.position === 'custom' && styles.optionChipTextActive]}>
                {style.position === 'custom' ? 'חופשי · גררת' : 'גררו את הכתובית'}
              </Text>
            </View>
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
        {studioTab === 'size' && (
          <View style={styles.optionRow}>
            {(['small', 'medium', 'large'] as CaptionSize[]).map((o) => (
              <Pressable
                key={o}
                onPress={() => setCaptionSize(o)}
                style={[styles.optionChip, captionSize === o && styles.optionChipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.optionChipText, captionSize === o && styles.optionChipTextActive]}>{CAPTION_SIZE_LABELS[o]}</Text>
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

      {/* the live caption: drag anywhere on the frame, tap to edit */}
      {activeLine && rect.w > 0 && (
        <GestureDetector gesture={captionGesture}>
          <Reanimated.View
            style={[styles.floatingCaption, captionAnimated]}
            onLayout={(e) => {
              chipW.value = e.nativeEvent.layout.width;
              chipH.value = e.nativeEvent.layout.height;
            }}
            accessibilityRole="button"
            accessibilityLabel="עריכת הכתובית (אפשר לגרור)"
          >
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
                      captionSize === 'small' && { fontSize: 22, lineHeight: 28 },
                      captionSize === 'large' && { fontSize: 30, lineHeight: 36 },
                      activeLine.text.length > 22 && { fontSize: 21, lineHeight: 26 },
                      !w.active && activeLine.words[i]?.em && { color: accent },
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
          </Reanimated.View>
        </GestureDetector>
      )}

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
            {/* words: tap = emphasis (always in the accent colour) · emoji chip = attach */}
            {sheetLine && sheetLine.text === draft && (
              <View style={styles.wordChips}>
                {sheetLine.words.map((w, i) => {
                  const hint = suggestEmoji(w.w);
                  return (
                    <View key={`${sheetLine.id}-${i}`} style={styles.wordChipWrap}>
                      <Pressable
                        onPress={() => commit((prev) => toggleEmphasis(prev, sheetLine.id, i))}
                        style={[styles.wordChip, w.em && { borderColor: accent }]}
                        accessibilityRole="button"
                        accessibilityLabel={`הדגשה ${w.w}`}
                      >
                        <Text style={[styles.wordChipText, w.em && { color: accent }]}>{w.w}</Text>
                      </Pressable>
                      {hint && (
                        <Pressable
                          onPress={() => {
                            commit((prev) => toggleEmoji(prev, sheetLine.id, i, hint));
                            const updated = lines.find((l) => l.id === sheetLine.id);
                            if (updated) setDraft(toggleEmoji([updated], sheetLine.id, i, hint)[0].text);
                          }}
                          style={styles.emojiChip}
                          accessibilityRole="button"
                          accessibilityLabel={`אימוג'י ${hint}`}
                        >
                          <Text style={styles.emojiChipText}>{hint}</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.sheetActions}>
              <Pressable style={styles.sheetAction} onPress={() => doNudge(-0.2)} accessibilityRole="button">
                <Text style={styles.sheetActionText}>−0.2ש׳</Text>
              </Pressable>
              <Pressable style={styles.sheetAction} onPress={() => doNudge(0.2)} accessibilityRole="button">
                <Text style={styles.sheetActionText}>+0.2ש׳</Text>
              </Pressable>
              <Pressable style={styles.sheetAction} onPress={doSplit} accessibilityRole="button">
                <Text style={styles.sheetActionText}>פיצול</Text>
              </Pressable>
              <Pressable style={styles.sheetAction} onPress={doMerge} accessibilityRole="button">
                <Text style={styles.sheetActionText}>איחוד עם הבאה</Text>
              </Pressable>
              <Pressable style={[styles.sheetAction, styles.sheetActionDanger]} onPress={doDelete} accessibilityRole="button">
                <Text style={[styles.sheetActionText, styles.sheetActionDangerText]}>מחיקה</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.sheetSave}
              onPress={() => saveEdit(draft)}
              accessibilityRole="button"
            >
              <Text style={styles.sheetSaveText}>שמירה</Text>
            </Pressable>
            <Text style={styles.sheetHint}>הקשה על מילה מדגישה אותה · הקשה מחוץ לחלון מבטלת</Text>
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
  roundButtonDisabled: { opacity: 0.35 },
  topActions: { flexDirection: 'row-reverse', gap: 8 },
  wordChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  wordChipWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  wordChip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#1E1E24',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  wordChipText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.medium },
  emojiChip: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1E1E24', alignItems: 'center', justifyContent: 'center' },
  emojiChipText: { fontSize: 17 },
  sheetActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  sheetAction: { paddingHorizontal: 12, height: 36, borderRadius: 999, backgroundColor: '#1E1E24', justifyContent: 'center' },
  sheetActionText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: fonts.medium },
  sheetActionDanger: { backgroundColor: 'rgba(255,77,77,0.14)' },
  sheetActionDangerText: { color: '#FF6B6B' },
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
  floatingCaption: { position: 'absolute', left: 0, top: 0, maxWidth: '86%' },
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
