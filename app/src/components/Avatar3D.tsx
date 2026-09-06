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
 * Vector avatar with soft 3D shading and refined, natural proportions
 * (Notion/Linear-style clean portrait) whose mouth animates as it "speaks".
 * On-brand, no emoji, no external asset, always renders.
 */
export function Avatar3D({ size = 112 }: { size?: number }) {
  const mouth = useSharedValue(1.4);

  useEffect(() => {
    mouth.value = withRepeat(
      withSequence(
        withTiming(3.6, { duration: 170 }),
        withTiming(1.4, { duration: 130 }),
        withTiming(3, { duration: 190 }),
        withTiming(1, { duration: 110 }),
        withTiming(4, { duration: 210 }),
        withTiming(1.4, { duration: 150 }),
        withTiming(1.4, { duration: 520 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(mouth);
  }, [mouth]);

  const mouthProps = useAnimatedProps(() => ({ ry: mouth.value }));

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Defs>
        <RadialGradient id="skin2" cx="0.42" cy="0.34" r="0.92">
          <Stop offset="0" stopColor="#FFE3BE" />
          <Stop offset="0.6" stopColor="#F0BE83" />
          <Stop offset="1" stopColor="#D89A57" />
        </RadialGradient>
        <SvgGradient id="hair2" x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#4B3722" />
          <Stop offset="1" stopColor="#291B10" />
        </SvgGradient>
        <SvgGradient id="shirt2" x1="0" y1="0" x2="0.6" y2="1">
          <Stop offset="0" stopColor="#3E4368" />
          <Stop offset="1" stopColor="#20233B" />
        </SvgGradient>
        <RadialGradient id="cheek2" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F0997A" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#F0997A" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="backglow" cx="0.5" cy="0.45" r="0.55">
          <Stop offset="0" stopColor="#FFD52E" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#FFD52E" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* soft back glow */}
      <Circle cx="60" cy="56" r="52" fill="url(#backglow)" />

      {/* shoulders — wider, lower, natural */}
      <Path d="M18 120c0-19 19-30 42-30s42 11 42 30z" fill="url(#shirt2)" />
      <Path d="M18 120c0-19 19-30 42-30 -16 5 -25 16 -25 30z" fill="#000" opacity="0.13" />
      {/* collar hint */}
      <Path d="M50 92c3 5 6 7 10 7s7-2 10-7" stroke="#000" strokeWidth="2" opacity="0.12" strokeLinecap="round" fill="none" />

      {/* short neck */}
      <Path d="M52 82h16v10c0 5-4 8-8 8s-8-3-8-8z" fill="url(#skin2)" />
      <Path d="M52 86c2 3 5 5 8 5s6-2 8-5v-4H52z" fill="#000" opacity="0.15" />

      {/* hair back */}
      <Path
        d="M30 50c0-18 13-31 30-31s30 13 30 31c0 6-1 11-3 15-2-14-6-21-9-23 2 8 2 15 0 19-12-6-24-6-36 0-2-4-2-11 0-19-3 2-7 9-9 23-2-4-3-9-3-15z"
        fill="url(#hair2)"
      />

      {/* face — slightly oval, natural proportion */}
      <Ellipse cx="60" cy="52" rx="23" ry="26" fill="url(#skin2)" />
      {/* right-side volume shadow */}
      <Path
        d="M60 26c13 0 23 12 23 26s-10 26-23 26c-3 0-6-1-9-2 9-3 15-12 15-24s-6-21-15-24c3-1 6-2 9-2z"
        fill="#000"
        opacity="0.09"
      />
      {/* forehead sheen */}
      <Ellipse cx="52" cy="38" rx="8" ry="4.5" fill="#FFF" opacity="0.16" />

      {/* cheeks */}
      <Circle cx="47" cy="58" r="7" fill="url(#cheek2)" />
      <Circle cx="73" cy="58" r="7" fill="url(#cheek2)" />

      {/* eyes — refined, almond */}
      <Ellipse cx="51" cy="50" rx="3" ry="4" fill="#241810" />
      <Ellipse cx="69" cy="50" rx="3" ry="4" fill="#241810" />
      <Circle cx="52.1" cy="48.7" r="1.1" fill="#FFF" />
      <Circle cx="70.1" cy="48.7" r="1.1" fill="#FFF" />
      {/* soft brows */}
      <Path d="M46 43.5c3-1.8 6-1.8 9 0" stroke="#3A2817" strokeWidth="2" strokeLinecap="round" />
      <Path d="M65 43.5c3-1.8 6-1.8 9 0" stroke="#3A2817" strokeWidth="2" strokeLinecap="round" />
      {/* nose hint */}
      <Path d="M60 52c0 3-1 5-2.5 6" stroke="#C98A52" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />

      {/* animated speaking mouth */}
      <AEllipse cx="60" cy="64" rx="5.5" animatedProps={mouthProps} fill="#6E2A2A" />
      <Ellipse cx="60" cy="62" rx="5" ry="1.3" fill="#FFF" opacity="0.85" />

      {/* front hair sweep with highlight */}
      <Path
        d="M37 46c2-15 12-26 26-26 -3 3 -3 8 -1 11 -8-3-16-3-24 0 -1-2-1-6 0-9-1 1-1 3-1 24z"
        fill="url(#hair2)"
        opacity="0"
      />
      <Path
        d="M36 47c2-16 13-27 27-27 3 0 6 1 9 2 4 2 8 7 10 15-3-6-7-9-10-10 1 3 1 6 0 8-11-4-21-4-31 0-1-2-1-5 0-8-2 1-4 8-5 20z"
        fill="url(#hair2)"
      />
      <Path d="M42 34c4-5 10-9 16-9" stroke="#7A5A38" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
    </Svg>
  );
}
