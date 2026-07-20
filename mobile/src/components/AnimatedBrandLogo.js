import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

const BRAND_ASSET = require('../../assets/brand-dp-3d.png');

const PARTS = [
  { top: 0, height: 0.46, x: 0, y: -0.62 },
  { top: 0.28, height: 0.33, x: 0.7, y: -0.08 },
  { top: 0.46, height: 0.27, x: -0.72, y: 0.03 },
  { top: 0.62, height: 0.22, x: 0.58, y: 0.3 },
  { top: 0.75, height: 0.25, x: 0, y: 0.92 },
];

export default function AnimatedBrandLogo({ size = 210 }) {
  const partProgress = useRef(PARTS.map(() => new Animated.Value(0))).current;
  const finalOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const assembly = Animated.stagger(
      130,
      partProgress.map(value => Animated.timing(value, {
        toValue: 1,
        duration: 680,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })),
    );
    const reveal = Animated.sequence([
      Animated.delay(1320),
      Animated.timing(finalOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    Animated.parallel([assembly, reveal]).start();
  }, [finalOpacity, partProgress]);

  return (
    <View style={[styles.stage, { width: size * 1.24, height: size * 1.24 }]}>
      <Animated.View
        style={[
          styles.logoCard,
          {
            width: size,
            height: size,
            borderRadius: size * 0.22,
          },
        ]}
      >
        {PARTS.map((part, index) => {
          const progress = partProgress[index];
          const top = size * part.top;
          const height = size * part.height;
          return (
            <Animated.View
              key={`${part.top}-${part.height}`}
              style={[
                styles.part,
                {
                  top,
                  width: size,
                  height,
                  opacity: progress,
                  transform: [
                    { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [size * part.x, 0] }) },
                    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [size * part.y, 0] }) },
                    { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.76, 1] }) },
                  ],
                },
              ]}
            >
              <Image
                source={BRAND_ASSET}
                resizeMode="cover"
                style={{ position: 'absolute', left: 0, top: -top, width: size, height: size }}
              />
            </Animated.View>
          );
        })}
        <Animated.Image
          source={BRAND_ASSET}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { width: size, height: size, opacity: finalOpacity }]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCard: {
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  part: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
  },
});
