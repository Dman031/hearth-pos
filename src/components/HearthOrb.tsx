import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { theme } from '../styles/theme';

interface HearthOrbProps {
  size?: number;
  listening?: boolean;
  onPress?: () => void;
}

// Breathing periods, derived in docs/HARVESTONCE_ORB_RECIPE.md.
// Main orb: one full cycle of sin(t * 0.8) is 2*pi / 0.8 ≈ 7854ms.
const ORB_BREATH_PERIOD_MS = 7854;
// Outer glow: 2*pi / 1.2 ≈ 5236ms.
const GLOW_BREATH_PERIOD_MS = 5236;

const ORB_SCALE_MIN = 1.0;
const ORB_SCALE_MAX = 1.03;
const GLOW_OPACITY_MIN = 0.02;
const GLOW_OPACITY_MAX = 0.06;
const GLOW_RADIUS_FACTOR = 1.22;

// Default stop opacities. `listening` brightens the inner two subtly.
const WARM_CORE_OPACITY = 0.9;
const WARM_CORE_LISTENING_OPACITY = 1.0;
const GOLD_MID_OPACITY = 0.95;
const GOLD_MID_LISTENING_OPACITY = 1.0;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function HearthOrb({
  size = 120,
  listening = false,
  onPress,
}: HearthOrbProps) {
  const scale = useSharedValue(ORB_SCALE_MIN);
  const glowOpacity = useSharedValue(GLOW_OPACITY_MIN);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(ORB_SCALE_MAX, {
        duration: ORB_BREATH_PERIOD_MS / 2,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [scale]);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withTiming(GLOW_OPACITY_MAX, {
        duration: GLOW_BREATH_PERIOD_MS / 2,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [glowOpacity]);

  const orbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowAnimatedProps = useAnimatedProps(() => ({
    opacity: glowOpacity.value,
  }));

  // Canvas is sized to fit the outer glow (1.22x), so the main orb sits
  // centered with padding around it for the halo.
  const canvas = size * GLOW_RADIUS_FACTOR;
  const center = canvas / 2;
  const orbRadius = size / 2;
  const glowRadius = orbRadius * GLOW_RADIUS_FACTOR;

  const warmCoreOpacity = listening
    ? WARM_CORE_LISTENING_OPACITY
    : WARM_CORE_OPACITY;
  const goldMidOpacity = listening
    ? GOLD_MID_LISTENING_OPACITY
    : GOLD_MID_OPACITY;

  const orb = (
    <Animated.View style={[{ width: canvas, height: canvas }, orbAnimatedStyle]}>
      <Svg width={canvas} height={canvas} viewBox={`0 0 ${canvas} ${canvas}`}>
        <Defs>
          <RadialGradient
            id="hearthOrbGradient"
            cx={center}
            cy={center}
            r={orbRadius}
            gradientUnits="userSpaceOnUse"
          >
            <Stop
              offset="0"
              stopColor={theme.colors.orb.warmCore}
              stopOpacity={warmCoreOpacity}
            />
            <Stop
              offset="0.35"
              stopColor={theme.colors.orb.goldMid}
              stopOpacity={goldMidOpacity}
            />
            <Stop
              offset="0.6"
              stopColor={theme.colors.orb.deepGold}
              stopOpacity={1}
            />
            <Stop
              offset="0.85"
              stopColor={theme.colors.orb.sageEdge}
              stopOpacity={1}
            />
            <Stop
              offset="1"
              stopColor={theme.colors.orb.darkSage}
              stopOpacity={1}
            />
          </RadialGradient>
        </Defs>
        {/* Outer glow halo — behind the main orb, breathes opacity only. */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={glowRadius}
          fill={theme.colors.orb.goldMid}
          animatedProps={glowAnimatedProps}
        />
        {/* Main orb — single 5-stop radial gradient. */}
        <Circle
          cx={center}
          cy={center}
          r={orbRadius}
          fill="url(#hearthOrbGradient)"
        />
      </Svg>
    </Animated.View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{orb}</Pressable>;
  }
  return <View>{orb}</View>;
}
