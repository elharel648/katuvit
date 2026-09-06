import { useMemo, useState } from 'react';
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
import type { CaptionLine, TranscriptSegment } from '@/lib/types';

export default function EditorScreen() {
  const initialLines = useMemo(() => {
    const session = getSession();
    const segments =
      session?.segments ?? (demoTranscript as TranscriptSegment[]);
    return splitIntoLines(segments);
  }, []);
  const [lines, setLines] = useState<CaptionLine[]>(initialLines);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);

  const editLine = (id: string, text: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, text, edited: true } : l)),
    );
  };

  const editedCount = lines.filter((l) => l.edited).length;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>עורך כתוביות</Text>
        <Text style={styles.subtitle}>
          {lines.length} שורות · {editedCount} תוקנו
        </Text>
      </View>

      <FlatList
        data={lines}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.lineRow}>
            <View style={styles.timeChip}>
              <Text style={styles.timeText}>
                {formatTime(item.start)}–{formatTime(item.end)}
              </Text>
              {item.edited && <View style={styles.editedDot} />}
            </View>
            <TextInput
              value={item.text}
              onChangeText={(t) => editLine(item.id, t)}
              style={styles.lineInput}
              multiline
              // Hebrew-first: RTL base direction; bidi handles embedded English
              textAlign="right"
            />
          </View>
        )}
      />

      <View style={styles.footer}>
        <FlatList
          horizontal
          inverted // RTL: first template on the right
          data={TEMPLATES}
          keyExtractor={(t) => t.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.templates}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setTemplateId(item.id)}
              style={[
                styles.templateChip,
                templateId === item.id && styles.templateChipActive,
              ]}
            >
              <View
                style={[
                  styles.templatePreview,
                  { backgroundColor: item.backgroundColor ?? 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.templatePreviewText,
                    {
                      color: item.textColor,
                      textShadowColor: item.outlineColor,
                    },
                  ]}
                >
                  אב
                </Text>
              </View>
              <Text style={styles.templateName}>{item.name}</Text>
            </Pressable>
          )}
        />
        <Pressable style={styles.exportButton} disabled>
          <Text style={styles.exportText}>ייצוא — מתחבר לשרת בקרוב</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E0E12' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'flex-end',
  },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#8E8E98', fontSize: 13, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  lineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    backgroundColor: '#1A1A21',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  timeChip: { alignItems: 'center', gap: 4, paddingTop: 4 },
  timeText: { color: '#8E8E98', fontSize: 11, fontVariant: ['tabular-nums'] },
  editedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  lineInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 24,
    padding: 0,
    writingDirection: 'rtl',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A33',
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
  },
  templates: { paddingHorizontal: 16, gap: 10 },
  templateChip: {
    alignItems: 'center',
    gap: 4,
    opacity: 0.6,
  },
  templateChipActive: { opacity: 1 },
  templatePreview: {
    width: 56,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A33',
  },
  templatePreviewText: {
    fontSize: 18,
    fontWeight: '800',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  templateName: { color: '#B8B8C2', fontSize: 12 },
  exportButton: {
    marginHorizontal: 16,
    backgroundColor: '#2A2A33',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  exportText: { color: '#8E8E98', fontSize: 16, fontWeight: '600' },
});
