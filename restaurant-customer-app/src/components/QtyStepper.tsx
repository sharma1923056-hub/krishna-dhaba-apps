import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';

interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  compact?: boolean;
}

export function QtyStepper({ value, onChange, min = 0, max = 50, compact }: Props) {
  const size = compact ? 32 : 40;
  return (
    <View style={[styles.wrap, { borderRadius: radius.md }]}>
      <Pressable
        accessibilityLabel="Decrease quantity"
        hitSlop={6}
        onPress={() => onChange(Math.max(min, value - 1))}
        style={[styles.btn, { width: size, height: size }]}
      >
        <Ionicons name={value <= 1 && min === 0 ? 'trash-outline' : 'remove'} size={compact ? 18 : 20} color={colors.primary} />
      </Pressable>
      <Text style={[styles.value, { minWidth: compact ? 26 : 34 }]}>{value}</Text>
      <Pressable
        accessibilityLabel="Increase quantity"
        hitSlop={6}
        onPress={() => onChange(Math.min(max, value + 1))}
        style={[styles.btn, { width: size, height: size }]}
      >
        <Ionicons name="add" size={compact ? 18 : 20} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.white },
  btn: { alignItems: 'center', justifyContent: 'center' },
  value: { textAlign: 'center', fontWeight: '700', fontSize: 15, color: colors.text },
});
