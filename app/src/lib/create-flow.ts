import * as LegacyFS from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { track } from './analytics';
import { QuotaError, uploadAndTranscribe, warmServer } from './api';
import { startSession } from './session';

export type CreatePhase = 'idle' | 'uploading' | 'transcribing';

export interface CreateState {
  phase: CreatePhase;
  /** 0..1 upload progress (only meaningful while uploading) */
  progress: number;
}

/** server enforces the same cap; keep in sync with MAX_DURATION_S */
const MAX_SECONDS = 180;

let state: CreateState = { phase: 'idle', progress: 0 };
const listeners = new Set<() => void>();

function setState(patch: Partial<CreateState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

/** the one create flow: pick → upload (with progress) → transcribe → editor. usable from anywhere. */
export async function startCreateFlow() {
  if (state.phase !== 'idle') return;
  warmServer(); // the GPU box wakes while the user is still choosing a clip
  track('create_started');

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    // iOS's own trimmer opens after picking; with videoMaxDuration it also caps the cut at 3 min
    allowsEditing: true,
    videoMaxDuration: MAX_SECONDS,
    // the trimmer re-encodes; without this iOS picks max bitrate (a 49MB clip came back as 295MB)
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1920x1080,
  });
  if (picked.canceled || !picked.assets[0]) return;
  const asset = picked.assets[0];
  track('create_picked', { seconds: Math.round((asset.duration ?? 0) / 1000) });

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
  if (!info?.exists || !('size' in info) || !info.size) {
    Alert.alert('לא הצלחנו לקרוא את הסרטון', 'נסו לבחור אותו שוב מהגלריה');
    return;
  }

  setState({ phase: 'uploading', progress: 0 });
  try {
    const t0 = Date.now();
    const result = await uploadAndTranscribe(asset.uri, {
      onProgress: (p) => setState({ progress: p }),
      onUploaded: () => {
        setState({ phase: 'transcribing', progress: 1 });
        track('upload_done', { ms: Date.now() - t0 });
      },
    });
    track('transcribe_done', {
      ms: Date.now() - t0,
      segments: result.segments.length,
      seconds: Math.round(result.duration),
    });
    await startSession({
      videoUri: asset.uri,
      segments: result.segments,
      duration: result.duration,
      mediaId: result.media_id,
    });
    // a previous editor may still be open (user picked again from inside it)
    if (router.canDismiss()) router.dismissAll();
    router.push('/editor');
  } catch (e) {
    if (e instanceof QuotaError) {
      track('paywall_shown', { from: 'create' });
      setTimeout(() => router.push('/paywall'), 400);
      return;
    }
    // an instant server rejection lands while the picker sheet is still animating
    // away, and iOS silently drops alerts presented during a modal dismissal
    const message = e instanceof Error ? e.message : 'נסו שוב';
    track('create_failed', { stage: state.phase, message: message.slice(0, 200) });
    setTimeout(() => Alert.alert('משהו השתבש', message), 600);
  } finally {
    setState({ phase: 'idle', progress: 0 });
  }
}

/** react hook: live create-flow state (phase + upload progress) */
export function useCreatePhase(): CreateState {
  const [value, setValue] = useState(state);
  useEffect(() => {
    const fn = () => setValue(state);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}
