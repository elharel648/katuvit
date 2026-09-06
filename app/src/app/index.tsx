import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as VideoThumbnails from 'expo-video-thumbnails';
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
import { getSession, startSession } from '@/lib/session';
import { fonts } from '@/lib/theme';

type Phase = 'idle' | 'uploading';

export default function HomeScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const session = getSession();

  useEffect(() => {
    if (!session?.videoUri) return;
    VideoThumbnails.getThumbnailAsync(session.videoUri, { time: 800 })
      .then((r) => setLastThumb(r.uri))
      .catch(() => {});
  }, [session?.videoUri]);

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

  const firstLine = session?.segments?.[0]?.text ?? '';

  return (
    <SafeAreaView style={styles.screen}>
      {/* quiet header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>כתוביות</Text>
        <View style={styles.avatar}>
          <SymbolView
            name="person"
            size={17}
            tintColor="rgba(255,255,255,0.7)"
          />
        </View>
      </View>

      {/* hero: the last result — or quiet type when there is none yet */}
      <View style={styles.heroZone}>
        {session && lastThumb ? (
          <Pressable
            style={styles.resultCard}
            onPress={() => router.push('/editor')}
          >
            <Image
              source={{ uri: lastThumb }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.cardScrim}
            />
            {firstLine !== '' && (
              <Text style={styles.cardCaption}>{firstLine}</Text>
            )}
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>
                הסרטון האחרון · {Math.round(session.duration)} שניות
              </Text>
              <View style={styles.playButton}>
                <SymbolView name="play.fill" size={15} tintColor="#0A0A0A" />
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={styles.emptyHero}>
            <Text style={styles.heroTitle}>
              כל מילה{'\n'}על המסך.
            </Text>
            <Text style={styles.heroSub}>
              כתוביות עברית מדויקות לרילס שלך —{'\n'}גם כשעוברים באמצע ל-English.
            </Text>
          </View>
        )}
      </View>

      {/* one action */}
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
              <ActivityIndicator color="#0A0A0A" />
              <Text style={styles.ctaText}>מעלה ומתמלל…</Text>
            </View>
          ) : (
            <View style={styles.busyRow}>
              <Text style={styles.ctaText}>סרטון חדש</Text>
              <SymbolView name="plus" size={16} tintColor="#0A0A0A" />
            </View>
          )}
        </Pressable>
        <Text style={styles.footnote}>
          עברית מדויקת · אנגלית באמצע משפט · ייצוא בלי ווטרמרק ב-Pro
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  wordmark: { color: '#FFFFFF', fontSize: 22, fontFamily: fonts.black },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#141418',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroZone: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  resultCard: {
    height: 520,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#101014',
  },
  cardScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  cardCaption: {
    position: 'absolute',
    bottom: 74,
    left: 16,
    right: 16,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: fonts.bold,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  cardFooter: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardMeta: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHero: { gap: 18, alignItems: 'flex-end' },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 54,
    lineHeight: 60,
    fontFamily: fonts.black,
    textAlign: 'right',
  },
  heroSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    lineHeight: 26,
    fontFamily: fonts.regular,
    textAlign: 'right',
  },
  actions: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  cta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { backgroundColor: '#E8E8EC' },
  ctaBusy: { opacity: 0.75 },
  busyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  ctaText: { color: '#0A0A0A', fontSize: 17, fontFamily: fonts.bold },
  footnote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
});
