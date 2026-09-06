import LottieView from 'lottie-react-native';
import { StyleSheet, View } from 'react-native';

import { Avatar3D } from './Avatar3D';
import { AVATAR_LOTTIE } from '@/lib/avatar-asset';

/**
 * Hero character. Plays a Lottie 3D-avatar animation when one is bundled
 * (see lib/avatar-asset.ts); otherwise falls back to the vector Avatar3D.
 */
export function HeroAvatar({ size = 150 }: { size?: number }) {
  if (AVATAR_LOTTIE) {
    return (
      <View style={{ width: size, height: size }}>
        <LottieView
          source={AVATAR_LOTTIE}
          autoPlay
          loop
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
        />
      </View>
    );
  }
  return <Avatar3D size={size} />;
}
