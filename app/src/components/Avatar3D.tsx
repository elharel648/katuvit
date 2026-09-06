import { useEffect } from 'react';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

const AEllipse = Animated.createAnimatedComponent(Ellipse);

/**
 * Vector avatar with 3D-style shading (layered gradients, rim light, soft
 * shadow) whose mouth animates open/closed — a warm figure that "speaks".
 * On-brand, no emoji, no external asset, always renders.
 */
export function Avatar3D({ size = 108 }: { size?: number }) {
  const mouth = useSharedValue(2); // mouth-open radius in svg units

  useEffect(() => {
    // natural speaking rhythm: varied open/close, not a metronome
    mouth.value = withRepeat(
      withSequence(
        withTiming(5.5, { duration: 180 }),
        withTiming(2, { duration: 140 }),
        withTiming(4.5, { duration: 200 }),
        withTiming(1.5, { duration: 120 }),
        withTiming(6, { duration: 220 }),
        withTiming(2, { duration: 160 }),
        withTiming(2, { duration: 500 }), // brief pause between "words"
      ),
      -1,
      false,
    );
    return () => cancelAnimation(mouth);
  }, [mouth]);

  const mouthProps = useAnimatedProps(() => ({ ry: mouth.value }));

  return (
    <Svg width={size} height={size} viewBox="0 0 120 128" fill="none">
      <Defs>
        <RadialGradient id="skin" cx="0.4" cy="0.3" r="0.9">
          <Stop offset="0" stopColor="#FFEAC9" />
          <Stop offset="0.55" stopColor="#F3C489" />
          <Stop offset="1" stopColor="#CE945422" stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="skinCore" cx="0.4" cy="0.32" r="0.85">
          <Stop offset="0" stopColor="#FFEAC9" />
          <Stop offset="0.6" stopColor="#F1C085" />
          <Stop offset="1" stopColor="#D89E5E" />
        </RadialGradient>
        <SvgGradient id="hair" x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#5A4028" />
          <Stop offset="0.5" stopColor="#3A2817" />
          <Stop offset="1" stopColor="#241810" />
        </SvgGradient>
        <SvgGradient id="shirt" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#454A72" />
          <Stop offset="1" stopColor="#222540" />
        </SvgGradient>
        <RadialGradient id="rim" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="1" stopColor="#FFD52E" stopOpacity="0.35" />
        </RadialGradient>
        <RadialGradient id="cheek" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F59A79" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#F59A79" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* rim glow */}
      <Circle cx="60" cy="60" r="58" fill="url(#rim)" />

      {/* shoulders */}
      <Path d="M20 128c0-22 18-36 40-36s40 14 40 36z" fill="url(#shirt)" />
      <Path d="M20 128c0-22 18-36 40-36 -14 6-22 20-22 36z" fill="#000" opacity="0.12" />

      {/* neck */}
      <Path d="M49 80h22v17c0 6-5 10-11 10s-11-4-11-10z" fill="url(#skinCore)" />
      <Path d="M49 86c3 5 7 7 11 7s8-2 11-7v-6H49z" fill="#000" opacity="0.14" />

      {/* hair back mass */}
      <Path
        d="M26 52c0-21 15-36 34-36s34 15 34 36c0 7-1 13-4 18-1-16-6-25-10-27 3 9 3 18 1 23-15-7-27-7-42 0-2-5-2-14 1-23-4 2-9 11-10 27-3-5-4-11-4-18z"
        fill="url(#hair)"
      />

      {/* face */}
      <Ellipse cx="60" cy="54" rx="27" ry="29" fill="url(#skinCore)" />
      {/* volume shadow on the right */}
      <Path
        d="M60 25c15 0 27 13 27 29s-12 29-27 29c-4 0-8-1-11-3 10-3 17-13 17-26s-7-23-17-26c3-2 7-3 11-3z"
        fill="#000"
        opacity="0.10"
      />
      {/* forehead highlight for sheen */}
      <Ellipse cx="50" cy="40" rx="10" ry="6" fill="#FFF" opacity="0.18" />

      {/* cheeks */}
      <Circle cx="45" cy="60" r="9" fill="url(#cheek)" />
      <Circle cx="75" cy="60" r="9" fill="url(#cheek)" />

      {/* eyes */}
      <Ellipse cx="50" cy="52" rx="3.6" ry="4.6" fill="#2A1D12" />
      <Ellipse cx="70" cy="52" rx="3.6" ry="4.6" fill="#2A1D12" />
      <Circle cx="51.4" cy="50.4" r="1.3" fill="#FFF" />
      <Circle cx="71.4" cy="50.4" r="1.3" fill="#FFF" />
      {/* brows */}
      <Path d="M44 44c3-2 6-2 9 0" stroke="#3A2817" strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M67 44c3-2 6-2 9 0" stroke="#3A2817" strokeWidth="2.2" strokeLinecap="round" />

      {/* animated speaking mouth */}
      <AEllipse cx="60" cy="66" rx="7" animatedProps={mouthProps} fill="#6E2A2A" />
      <Ellipse cx="60" cy="63.5" rx="6" ry="1.6" fill="#FFF" opacity="0.9" />

      {/* front hair sweep */}
      <Path
        d="M32 46c2-17 14-28 28-28s26 11 28 28c-4-9-10-13-13-14 1 3 1 7 0 9-10-4-20-4-30 0-1-2-1-6 0-9-3 1-9 5-13 14z"
        fill="url(#hair)"
      />
      <Path d="M40 34c4-6 11-10 17-10" stroke="#7A5A38" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
    </Svg>
  );
}
