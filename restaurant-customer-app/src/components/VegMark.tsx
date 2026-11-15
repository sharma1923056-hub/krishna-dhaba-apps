import { StyleSheet, View } from 'react-native';

export function VegMark({ veg }: { veg: boolean }) {
  const c = veg ? '#2F9E44' : '#C92A2A';
  return (
    <View style={[styles.box, { borderColor: c }]} accessibilityLabel={veg ? 'Vegetarian' : 'Non-vegetarian'}>
      <View style={[styles.dot, { backgroundColor: c }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 16, height: 16, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
