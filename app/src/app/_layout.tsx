import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_700Bold,
  Rubik_900Black,
  useFonts,
} from '@expo-google-fonts/rubik';
import { Heebo_700Bold } from '@expo-google-fonts/heebo';
import { SecularOne_400Regular } from '@expo-google-fonts/secular-one';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { installErrorReporting, track } from '@/lib/analytics';
import { fetchMe } from '@/lib/api';
import { ensureSignedIn } from '@/lib/auth';
import { loadSessions } from '@/lib/session';
import { loadSettings } from '@/lib/settings';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_700Bold,
    Rubik_900Black,
    Heebo_700Bold,
    SecularOne_400Regular,
  });

  useEffect(() => {
    installErrorReporting();
    loadSettings(); // persisted export quality / caption size / dictionary, before any export
    loadSessions(); // the user's recent videos (and their edits) survive a restart
    // guest identity + entitlements; failures are non-fatal here (the first API call retries)
    ensureSignedIn()
      .then(() => {
        track('app_open');
        return fetchMe();
      })
      .catch((e) => console.log('[auth] boot sign-in failed', e));
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="editor" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
