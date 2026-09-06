import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius, spacing } from '@/lib/theme';

function Row({
  symbol,
  label,
  value,
  onPress,
}: {
  symbol: string;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <View style={styles.rowIcon}>
        <SymbolView name={symbol as never} size={16} tintColor={colors.accent} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {value != null && <Text style={styles.rowValue}>{value}</Text>}
      {onPress && (
        <SymbolView name="chevron.left" size={13} tintColor={colors.textFaint} />
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const soon = () => Alert.alert('בקרוב', 'האפשרות הזו נפתחת בגרסה הקרובה');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>הגדרות</Text>

        <Text style={styles.sectionHeader}>חשבון</Text>
        <View style={styles.group}>
          <Row symbol="crown.fill" label="שדרוג ל-Pro" value="בקרוב" onPress={soon} />
          <View style={styles.divider} />
          <Row symbol="arrow.counterclockwise" label="שחזור רכישות" onPress={soon} />
        </View>

        <Text style={styles.sectionHeader}>ייצוא</Text>
        <View style={styles.group}>
          <Row symbol="4k.tv" label="איכות ייצוא" value="1080p" onPress={soon} />
          <View style={styles.divider} />
          <Row symbol="textformat" label="גודל כתוביות ברירת מחדל" value="בינוני" onPress={soon} />
        </View>

        <Text style={styles.sectionHeader}>פרטיות</Text>
        <View style={styles.group}>
          <Row
            symbol="lock.fill"
            label="שמירת סרטונים בשרת"
            value="נמחקים עד 24 שעות"
          />
          <View style={styles.divider} />
          <Row symbol="hand.raised.fill" label="מדיניות פרטיות" onPress={soon} />
        </View>

        <Text style={styles.sectionHeader}>עזרה</Text>
        <View style={styles.group}>
          <Row symbol="bubble.left.fill" label="דברו איתנו בוואטסאפ" onPress={soon} />
          <View style={styles.divider} />
          <Row symbol="star.fill" label="דרגו אותנו" onPress={soon} />
        </View>

        <Text style={styles.version}>כתוביות · גרסה 0.1 (פיתוח)</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  title: {
    color: colors.text,
    fontSize: 26,
    fontFamily: fonts.black,
    marginBottom: spacing.xs,
  },
  sectionHeader: {
    color: colors.textFaint,
    fontSize: 13,
    fontFamily: fonts.medium,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.medium,
    textAlign: 'right',
  },
  rowValue: {
    color: colors.textFaint,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  version: {
    color: colors.textFaint,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
