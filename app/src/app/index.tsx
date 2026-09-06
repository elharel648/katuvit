import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.logo}>כתוביות</Text>
        <Text style={styles.tagline}>
          כתוביות עברית מדויקות לרילס שלך — תוך דקות, מהטלפון
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.buttonDisabled]} disabled>
          <Text style={styles.buttonTextDisabled}>
            בחירת סרטון — בקרוב (מתחבר לשרת)
          </Text>
        </Pressable>

        <Link href="/editor" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>פתח דמו עורך (הסרטון של יובל)</Text>
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
  buttonDisabled: { backgroundColor: '#1A1A21' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  buttonTextDisabled: { color: '#5A5A66', fontSize: 16, fontWeight: '600' },
});
