import Constants from 'expo-constants';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CAPTION_SIZE_LABELS,
  updateSettings,
  useSettings,
} from '@/lib/settings';
import { colors, fonts, radius, spacing } from '@/lib/theme';

// TODO(harel): החלף למספר הוואטסאפ העסקי שלך
const WHATSAPP_NUMBER = '';

const PRIVACY_TEXT = `מדיניות פרטיות — כתוביות (גרסת פיתוח)

• הסרטון שאת/ה מעלה נשלח לשרת שלנו לצורך תמלול וצריבת כתוביות בלבד.
• הקובץ נמחק מהשרת אוטומטית עד 24 שעות מההעלאה.
• התמלול מעובד על ידי מודל בינה מלאכותית שרץ על תשתית הענן שלנו (Modal). איננו מוכרים או משתפים את התוכן שלך עם אף גורם.
• באפליקציה אין חשבון אישי בשלב זה; מזהה אנונימי משמש למניין השימוש בלבד.
• לכל שאלה או בקשת מחיקה: דברו איתנו דרך מסך ההגדרות.`;

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
  const settings = useSettings();
  const [showPrivacy, setShowPrivacy] = useState(false);

  const pickQuality = () =>
    Alert.alert('איכות ייצוא', 'באיזו רזולוציה לייצא את הסרטונים?', [
      { text: '1080p (מומלץ)', onPress: () => updateSettings({ exportQuality: '1080p' }) },
      { text: '720p (קובץ קטן יותר)', onPress: () => updateSettings({ exportQuality: '720p' }) },
      { text: 'ביטול', style: 'cancel' },
    ]);

  const pickCaptionSize = () =>
    Alert.alert('גודל כתוביות', 'גודל ברירת המחדל לצריבה:', [
      { text: 'קטן', onPress: () => updateSettings({ captionSize: 'small' }) },
      { text: 'בינוני (מומלץ)', onPress: () => updateSettings({ captionSize: 'medium' }) },
      { text: 'גדול', onPress: () => updateSettings({ captionSize: 'large' }) },
      { text: 'ביטול', style: 'cancel' },
    ]);

  const openWhatsApp = () => {
    if (!WHATSAPP_NUMBER) {
      Alert.alert('עוד רגע', 'קו הוואטסאפ ייפתח עם ההשקה');
      return;
    }
    Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}`);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>הגדרות</Text>

        <Text style={styles.sectionHeader}>ייצוא</Text>
        <View style={styles.group}>
          <Row
            symbol="4k.tv"
            label="איכות ייצוא"
            value={settings.exportQuality}
            onPress={pickQuality}
          />
          <View style={styles.divider} />
          <Row
            symbol="textformat"
            label="גודל כתוביות ברירת מחדל"
            value={CAPTION_SIZE_LABELS[settings.captionSize]}
            onPress={pickCaptionSize}
          />
        </View>

        <Text style={styles.sectionHeader}>פרטיות</Text>
        <View style={styles.group}>
          <Row
            symbol="lock.fill"
            label="שמירת סרטונים בשרת"
            value="נמחקים עד 24 שעות"
          />
          <View style={styles.divider} />
          <Row
            symbol="hand.raised.fill"
            label="מדיניות פרטיות"
            onPress={() => setShowPrivacy(true)}
          />
        </View>

        <Text style={styles.sectionHeader}>חשבון</Text>
        <View style={styles.group}>
          <Row
            symbol="crown.fill"
            label="שדרוג ל-Pro"
            value="נפתח בהשקה"
          />
        </View>

        <Text style={styles.sectionHeader}>עזרה</Text>
        <View style={styles.group}>
          <Row
            symbol="bubble.left.fill"
            label="דברו איתנו בוואטסאפ"
            onPress={openWhatsApp}
          />
        </View>

        <Text style={styles.version}>
          כתוביות · גרסה {Constants.expoConfig?.version ?? '0.1.0'}
        </Text>
      </ScrollView>

      <Modal
        visible={showPrivacy}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPrivacy(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowPrivacy(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>מדיניות פרטיות</Text>
            <ScrollView style={styles.sheetScroll}>
              <Text style={styles.sheetBody}>{PRIVACY_TEXT}</Text>
            </ScrollView>
            <Pressable style={styles.sheetClose} onPress={() => setShowPrivacy(false)}>
              <Text style={styles.sheetCloseText}>סגירה</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm, paddingBottom: 120 },
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    maxHeight: '75%',
    gap: spacing.md,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.bold,
    textAlign: 'right',
  },
  sheetScroll: { flexGrow: 0 },
  sheetBody: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 24,
    fontFamily: fonts.regular,
    textAlign: 'right',
  },
  sheetClose: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 999,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
});
