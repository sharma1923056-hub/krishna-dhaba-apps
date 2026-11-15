import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View, type ImageStyle } from 'react-native';
import { imageUrl } from '@/lib/config';
import { colors } from '@/theme';

export function ProductImage({ path, style }: { path: string | null; style?: ImageStyle }) {
  const uri = imageUrl(path);
  if (!uri) {
    return (
      <View style={[styles.placeholder, style]}>
        <Ionicons name="restaurant" size={28} color={colors.border} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.image, style]} contentFit="cover" transition={150} />;
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.border },
  placeholder: { backgroundColor: '#F6EBDD', alignItems: 'center', justifyContent: 'center' },
});
