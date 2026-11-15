import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, radius } from '@/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const isDisabled = disabled || loading;
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? colors.white : variant === 'ghost' ? colors.primary : colors.primary;
  const border = variant === 'outline' ? colors.primary : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderColor: border, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.text, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  text: { fontSize: 16, fontWeight: '700' },
});
