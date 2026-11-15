import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';
import { Button } from './Button';

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.sub}>{message ?? 'Please check your internet connection and try again.'}</Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} style={{ marginTop: 16, minWidth: 160 }} /> : null}
    </View>
  );
}

export function EmptyView({
  icon = 'restaurant-outline',
  title,
  subtitle,
  actionTitle,
  onAction,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={52} color={colors.border} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {actionTitle && onAction ? <Button title={actionTitle} onPress={onAction} style={{ marginTop: 16, minWidth: 180 }} /> : null}
    </View>
  );
}

export function Banner({ kind, text }: { kind: 'warning' | 'danger' | 'success'; text: string }) {
  const bg = kind === 'warning' ? colors.warningBg : kind === 'danger' ? colors.dangerBg : colors.successBg;
  const fg = kind === 'warning' ? colors.warning : kind === 'danger' ? colors.danger : colors.success;
  const icon = kind === 'success' ? 'checkmark-circle' : kind === 'danger' ? 'alert-circle' : 'information-circle';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={[styles.bannerText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.bg },
  title: { marginTop: 12, fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  sub: { marginTop: 6, fontSize: 14, color: colors.muted, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
});
