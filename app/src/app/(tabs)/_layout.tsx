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
  const phase = useCreatePhase();

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
      <BlurView intensity={50} tint="dark" style={styles.bar}>
        {/* right: home */}
        <TabItem
          {...sideTabs[0]}
          active={isActive('index')}
          onPress={() => go('index')}
        />

        {/* center: create */}
        <Pressable
          onPress={() => startCreateFlow()}
          style={styles.createWrap}
          disabled={phase === 'uploading'}
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
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <SymbolView name="plus" size={30} tintColor={colors.onAccent} />
            )}
          </View>
        </Pressable>

        {/* left: settings */}
        <TabItem
          {...sideTabs[1]}
          active={isActive('settings')}
          onPress={() => go('settings')}
        />
      </BlurView>
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
    <Pressable style={styles.tabItem} onPress={onPress} hitSlop={8}>
      <SymbolView
        name={icon as never}
        size={23}
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
    height: 68,
    borderRadius: 34,
    paddingHorizontal: 30,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(18,22,36,0.7)',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: 64,
  },
  tabLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  tabLabelActive: { color: colors.accent, fontFamily: fonts.bold },
  activeDot: {
    position: 'absolute',
    bottom: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  createWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 76,
    marginTop: -34,
  },
  createGlow: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
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
