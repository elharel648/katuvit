import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * Vector avatar with 3D-style shading (gradients + highlights + soft shadow)
 * — a warm speaking figure, on-brand, no emoji, no licensing worries.
 */
export function Avatar3D({ size = 108 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Defs>
        <RadialGradient id="skin" cx="0.38" cy="0.32" r="0.85">
          <Stop offset="0" stopColor="#FFE9C4" />
          <Stop offset="0.6" stopColor="#F5C98E" />
          <Stop offset="1" stopColor="#D99E5E" />
        </RadialGradient>
        <SvgGradient id="hair" x1="0" y1="0" x2="0.7" y2="1">
          <Stop offset="0" stopColor="#4A3524" />
          <Stop offset="1" stopColor="#2A1D12" />
        </SvgGradient>
        <SvgGradient id="shirt" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B3F63" />
          <Stop offset="1" stopColor="#242741" />
        </SvgGradient>
        <RadialGradient id="cheek" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F7A98A" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#F7A98A" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* shoulders / shirt */}
      <Path
        d="M22 120c0-20 17-33 38-33s38 13 38 33z"
        fill="url(#shirt)"
      />
      {/* neck */}
      <Path d="M50 78h20v16c0 6-4 9-10 9s-10-3-10-9z" fill="url(#skin)" />
      <Path d="M50 84c3 4 7 6 10 6s7-2 10-6v-6H50z" fill="#000" opacity="0.12" />

      {/* hair back */}
      <Path
        d="M28 52c0-20 14-34 32-34s32 14 32 34c0 6-1 11-3 15-2-14-6-22-9-24 2 8 2 16 0 20-14-6-26-6-40 0-2-4-2-12 0-20-3 2-7 10-9 24-2-4-3-9-3-15z"
        fill="url(#hair)"
      />
      {/* face */}
      <Ellipse cx="60" cy="52" rx="26" ry="28" fill="url(#skin)" />
      {/* soft side shadow for 3D volume */}
      <Path
        d="M60 24c14 0 26 12 26 28s-12 28-26 28c-4 0-8-1-11-3 9-2 16-12 16-25s-7-23-16-25c3-2 7-3 11-3z"
        fill="#000"
        opacity="0.10"
      />
      {/* cheeks */}
      <Circle cx="46" cy="58" r="8" fill="url(#cheek)" />
      <Circle cx="74" cy="58" r="8" fill="url(#cheek)" />
      {/* eyes */}
      <Ellipse cx="50" cy="50" rx="3.4" ry="4.2" fill="#2A1D12" />
      <Ellipse cx="70" cy="50" rx="3.4" ry="4.2" fill="#2A1D12" />
      <Circle cx="51.2" cy="48.6" r="1.1" fill="#FFF" />
      <Circle cx="71.2" cy="48.6" r="1.1" fill="#FFF" />
      {/* brows */}
      <Path d="M45 43c2-1.6 5-1.6 8 0" stroke="#3A2817" strokeWidth="2" strokeLinecap="round" />
      <Path d="M67 43c3-1.6 6-1.6 8 0" stroke="#3A2817" strokeWidth="2" strokeLinecap="round" />
      {/* open mouth — speaking */}
      <Path
        d="M52 63c2.6 5 13.4 5 16 0-2.6 2-13.4 2-16 0z"
        fill="#7A2E2E"
      />
      <Path d="M54 63.5c2 1 10 1 12 0" stroke="#FFF" strokeWidth="2.4" strokeLinecap="round" />
      {/* front hair sweep + highlight */}
      <Path
        d="M34 44c2-16 13-26 26-26s24 10 26 26c-4-8-9-12-12-13 1 3 1 6 0 8-9-4-19-4-28 0-1-2-1-5 0-8-3 1-8 5-12 13z"
        fill="url(#hair)"
      />
      <Path d="M40 34c4-6 11-10 18-10" stroke="#6B4E33" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
    </Svg>
  );
}
