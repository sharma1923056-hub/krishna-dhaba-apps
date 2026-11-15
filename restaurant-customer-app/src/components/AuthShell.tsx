import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/theme';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.primary }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={[styles.hero, { paddingTop: insets.top + 36 }]}>
          <Text style={styles.brand}>Krishna Dhaba</Text>
          <Text style={styles.tag}>Fresh, hot & delivered to your door</Text>
        </View>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 24, paddingBottom: 28 },
  brand: { color: colors.white, fontSize: 32, fontWeight: '800' },
  tag: { color: '#FFE3D3', fontSize: 14, marginTop: 4 },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 20, borderRadius: radius.sm },
});
