import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { quotaLabel, useEntitlements } from '@/lib/entitlements';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Offers. Every video costs us GPU time, so nothing is unlimited: three free
 * videos with a small watermark, then packs (pay per video) or Pro (monthly cap).
 * Purchases go through Apple; the buttons light up once RevenueCat is connected.
 */
const PURCHASES_LIVE = false;

const OFFERS = [
  { id: 'pack10', title: '10 סרטונים', price: '29 ₪', note: 'בלי סימן מים · לא פג תוקף', kind: 'pack' as const },
  { id: 'pack30', title: '30 סרטונים', price: '69 ₪', note: 'בלי סימן מים · 2.3 ₪ לסרטון', kind: 'pack' as const },
  { id: 'pro', title: 'Pro', price: '39 ₪ לחודש', note: 'עד 60 סרטונים בחודש · בלי סימן מים · כל הסגנונות', kind: 'pro' as const },
];

export default function PaywallScreen() {
  const ent = useEntitlements();

  const buy = (id: string) => {
    if (!PURCHASES_LIVE) {
      Alert.alert('עוד רגע', 'התשלומים ייפתחו עם חשבון המפתח של Apple. עד אז יש לך את הסרטונים החינמיים.');
      return;
    }
    // RevenueCat purchase flow lands here
    console.log('[paywall] buy', id);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="סגירה">
          <SymbolView name="xmark" size={18} tintColor={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.kicker}>{quotaLabel(ent) ?? 'סרטונים'}</Text>
        <Text style={styles.headline}>עוד סרטונים.{'\n'}בלי סימן מים.</Text>
        <Text style={styles.sub}>
          שלושת הסרטונים הראשונים חינם, עם "כתוביות" קטן בפינה. מפה, כל סרטון שאתם מייצאים
          עולה לנו כמה אגורות של מעבד, אז משלמים לפי שימוש.
        </Text>

        {OFFERS.map((o) => (
          <Pressable
            key={o.id}
            style={[styles.offer, o.kind === 'pro' && styles.offerPro]}
            onPress={() => buy(o.id)}
            accessibilityRole="button"
            accessibilityLabel={`${o.title} ${o.price}`}
          >
            <View style={styles.offerText}>
              <Text style={[styles.offerTitle, o.kind === 'pro' && styles.offerTitlePro]}>{o.title}</Text>
              <Text style={styles.offerNote}>{o.note}</Text>
            </View>
            <Text style={[styles.offerPrice, o.kind === 'pro' && styles.offerTitlePro]}>{o.price}</Text>
          </Pressable>
        ))}

        <Text style={styles.fine}>
          {PURCHASES_LIVE
            ? 'החיוב דרך Apple. מנוי מתחדש אוטומטית וניתן לביטול בכל עת בהגדרות המכשיר.'
            : 'התשלומים ייפתחו עם ההשקה. בינתיים אפשר להשתמש בסרטונים החינמיים.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 },
  kicker: { color: colors.accent, fontSize: 13, fontFamily: fonts.bold, textAlign: 'right' },
  headline: { color: colors.text, fontSize: 32, lineHeight: 38, fontFamily: fonts.black, textAlign: 'right', marginBottom: spacing.xs },
  sub: { color: colors.textDim, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, textAlign: 'right', marginBottom: spacing.md },
  offer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  offerPro: { backgroundColor: colors.accent, borderColor: colors.accent },
  offerText: { flex: 1, gap: 3 },
  offerTitle: { color: colors.text, fontSize: 17, fontFamily: fonts.bold, textAlign: 'right' },
  offerTitlePro: { color: colors.onAccent },
  offerNote: { color: colors.textDim, fontSize: 12, fontFamily: fonts.regular, textAlign: 'right' },
  offerPrice: { color: colors.text, fontSize: 16, fontFamily: fonts.bold, marginLeft: spacing.sm },
  fine: { color: colors.textFaint, fontSize: 12, lineHeight: 18, fontFamily: fonts.regular, textAlign: 'right', marginTop: spacing.md },
});
