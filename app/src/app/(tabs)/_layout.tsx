import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, fonts } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          height: 84,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'בית',
          tabBarIcon: ({ color }) => (
            <SymbolView name="house.fill" size={22} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'הסרטונים שלי',
          tabBarIcon: ({ color }) => (
            <SymbolView name="film.stack" size={22} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'הגדרות',
          tabBarIcon: ({ color }) => (
            <SymbolView name="gearshape.fill" size={22} tintColor={color} />
          ),
        }}
      />
    </Tabs>
  );
}
