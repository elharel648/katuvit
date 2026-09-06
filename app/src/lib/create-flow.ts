import * as LegacyFS from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { uploadAndTranscribe } from './api';
import { startSession } from './session';

type Phase = 'idle' | 'uploading';

/** server enforces the same cap; keep in sync with MAX_DURATION_S */
const MAX_SECONDS = 180;

let phase: Phase = 'idle';
const listeners = new Set<() => void>();

function setPhase(p: Phase) {
  phase = p;
  listeners.forEach((fn) => fn());
}

/** the one create flow: pick → upload+transcribe → editor. usable from anywhere. */
export async function startCreateFlow() {
  if (phase === 'uploading') return;

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: 180,
  });
  if (picked.canceled || !picked.assets[0]) return;
  const asset = picked.assets[0];

  // ImagePicker reports duration in ms; library picks are NOT limited by videoMaxDuration
  if (asset.duration && asset.duration / 1000 > MAX_SECONDS) {
    Alert.alert(
      'הסרטון ארוך מדי',
      `בגרסה הזו אפשר עד ${MAX_SECONDS / 60} דקות. חתכו אותו באפליקציית התמונות ונסו שוב.`,
    );
    return;
  }

  // the picker hands us a copy in the app cache; make sure it is really readable
  const info = await LegacyFS.getInfoAsync(asset.uri).catch(() => null);
  console.log('[create] picked', asset.uri, info);
  if (!info?.exists || !('size' in info) || !info.size) {
    Alert.alert('לא הצלחנו לקרוא את הסרטון', 'נסו לבחור אותו שוב מהגלריה');
    return;
  }

  setPhase('uploading');
  try {
    const result = await uploadAndTranscribe(asset.uri);
    startSession({
      videoUri: asset.uri,
      segments: result.segments,
      duration: result.duration,
      mediaId: result.media_id,
    });
    router.push('/editor');
  } catch (e) {
    Alert.alert('משהו השתבש', e instanceof Error ? e.message : 'נסו שוב');
  } finally {
    setPhase('idle');
  }
}

export function useCreatePhase(): Phase {
  const [value, setValue] = useState(phase);
  useEffect(() => {
    const fn = () => setValue(phase);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}
