import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

export const C = {
  ink: '#17202A', muted: '#667085', orange: '#D9480F',
  pale: '#FFF3EC', line: '#E7E9ED', white: '#FFFFFF',
  green: '#16834A', red: '#C62828', bg: '#F6F7F9'
};
export function Screen({ children }: { children: React.ReactNode }) {
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}
export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={{ marginBottom: 18 }}><Text style={s.heading}>{title}</Text>{!!subtitle && <Text style={s.sub}>{subtitle}</Text>}</View>;
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
export function Action({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[s.action, secondary && s.secondary, disabled && { opacity: .5 }]}><Text style={[s.actionText, secondary && { color: C.ink }]}>{title}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ marginBottom: 13 }}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#98A2B3" {...props} style={[s.input, props.style]} /></View>;
}
export function Stat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return <View style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={[s.statValue, accent && { color: C.orange }]}>{value}</Text></View>;
}
export function Busy() { return <View style={{ padding: 30 }}><ActivityIndicator color={C.orange} /></View>; }
export function ErrorText({ children }: { children: React.ReactNode }) { return <Text style={{ color: C.red, marginVertical: 8 }}>{children}</Text>; }
export const styles = s;
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, paddingBottom: 36 },
  heading: { fontSize: 25, fontWeight: '800', color: C.ink },
  sub: { fontSize: 13, color: C.muted, marginTop: 5 },
  card: { backgroundColor: C.white, borderRadius: 15, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 6 },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: C.ink, fontSize: 15 },
  action: { backgroundColor: C.orange, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 11, alignItems: 'center', marginTop: 5 },
  secondary: { backgroundColor: C.pale, borderWidth: 1, borderColor: '#F5C4AD' },
  actionText: { color: C.white, fontWeight: '800' },
  stat: { width: '48%', backgroundColor: C.white, borderRadius: 14, padding: 15, borderColor: C.line, borderWidth: 1, marginBottom: 10 },
  statLabel: { color: C.muted, fontSize: 12, fontWeight: '600' },
  statValue: { color: C.ink, fontSize: 23, fontWeight: '800', marginTop: 7 }
});
