import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { startCreateFlow, useCreatePhase } from '@/lib/create-flow';
import { colors, fonts } from '@/lib/theme';

const glow = {
  '0%': { opacity: 0.5 },
  '50%': { opacity: 0.9 },
  '100%': { opacity: 0.5 },
};

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { phase, progress } = useCreatePhase();

  const sideTabs = [
    { name: 'index', label: 'בית', icon: 'house.fill' },
    { name: 'settings', label: 'הגדרות', icon: 'gearshape.fill' },
  ];

  const isActive = (routeName: string) =>
    state.routes[state.index]?.name === routeName;

  const go = (routeName: string) => {
    const target = state.routes.find((r: { name: string }) => r.name === routeName);
    if (target) navigation.navigate(target.name);
  };

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || 12 }]}>
      <BlurView intensity={40} tint="systemThickMaterialDark" style={styles.bar}>
        {/* right: home */}
        <TabItem
          {...sideTabs[0]}
          active={isActive('index')}
          onPress={() => go('index')}
        />

        {/* center spacer — the real button floats above (outside the clipped blur) */}
        <View style={styles.createWrap} />

        {/* left: settings */}
        <TabItem
          {...sideTabs[1]}
          active={isActive('settings')}
          onPress={() => go('settings')}
        />
      </BlurView>

      {/* floating create button — sibling of the bar so nothing clips it */}
      <View pointerEvents="box-none" style={[styles.createLayer, { bottom: (insets.bottom || 12) + 36 }]}>
        <Pressable
          onPress={() => startCreateFlow()}
          accessibilityRole="button"
          accessibilityLabel="סרטון חדש"
          style={styles.createHit}
          disabled={phase !== 'idle'}
        >
          <Animated.View
            style={[
              styles.createGlow,
              {
                animationName: glow,
                animationDuration: '2400ms',
                animationIterationCount: 'infinite',
                animationTimingFunction: 'ease-in-out',
              },
            ]}
          />
          <View style={styles.createButton}>
            {phase === 'uploading' ? (
              <Text style={styles.createPct}>{Math.round(progress * 100)}%</Text>
            ) : phase === 'transcribing' ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <SymbolView name="plus" size={30} tintColor={colors.onAccent} />
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function TabItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.tabItem}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <SymbolView
        name={icon as never}
        size={27}
        tintColor={active ? colors.accent : colors.textFaint}
      />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
      {active && <View style={styles.activeDot} />}
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen
        name="create"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            startCreateFlow();
          },
        }}
      />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 74,
    borderRadius: 37,
    paddingHorizontal: 30,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,10,11,0.6)',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 72,
  },
  tabLabel: {
    color: colors.textFaint,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  tabLabelActive: { color: colors.accent, fontFamily: fonts.bold },
  activeDot: {
    position: 'absolute',
    bottom: -9,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  createWrap: { width: 76 },
  createLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  createHit: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createGlow: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  createPct: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.bold },
  createButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.bg,
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
});
