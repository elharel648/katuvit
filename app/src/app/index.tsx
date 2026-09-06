import * as ImagePicker from 'expo-image-picker';
import { Link, router } from 'expo-router';
import { useState } from 'react';
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

type Phase = 'idle' | 'uploading';

export default function HomeScreen() {
  const [phase, setPhase] = useState<Phase>('idle');

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

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.logo}>כתוביות</Text>
        <Text style={styles.tagline}>
          כתוביות עברית מדויקות לרילס שלך — תוך דקות, מהטלפון
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, phase === 'uploading' && styles.buttonBusy]}
          onPress={pickAndTranscribe}
          disabled={phase === 'uploading'}
        >
          {phase === 'uploading' ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.buttonText}>מעלה ומתמלל…</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>בחר/י סרטון לכתוביות</Text>
          )}
        </Pressable>

        <Link href="/editor" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>דמו עורך (בלי העלאה)</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0E0E12',
    justifyContent: 'space-between',
  },
  hero: { alignItems: 'center', marginTop: 96, paddingHorizontal: 32, gap: 16 },
  logo: { color: '#FFFFFF', fontSize: 44, fontWeight: '800' },
  tagline: { color: '#B8B8C2', fontSize: 17, textAlign: 'center', lineHeight: 26 },
  actions: { padding: 20, gap: 12, marginBottom: 24 },
  button: {
    backgroundColor: '#635BFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonBusy: { opacity: 0.7 },
  busyRow: { flexDirection: 'row-reverse', gap: 10, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#1A1A21',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { color: '#8E8E98', fontSize: 15, fontWeight: '600' },
});
