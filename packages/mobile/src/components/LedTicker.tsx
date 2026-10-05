import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';

/**
 * Bande lumineuse défilante (Adel, 05/10/2026) : slogans courts qui encouragent à identifier,
 * partager et être crédité, sans prendre de place. Texte blanc 14 px sur fond sombre (lisible),
 * défilement lent en boucle. Jamais interactive : pointerEvents none.
 */
type Props = { messages: string[]; testID?: string };

export default function LedTicker({ messages, testID = 'led-ticker' }: Props) {
  const text = `${messages.join('   ✦   ')}   ✦   `;
  const [textWidth, setTextWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!textWidth) return undefined;
    x.setValue(0);
    const loop = Animated.loop(Animated.timing(x, {
      toValue: -textWidth,
      duration: Math.max(12000, textWidth * 28),
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
    }));
    loop.start();
    return () => loop.stop();
  }, [textWidth, x]);

  return (
    <View style={s.band} testID={testID} pointerEvents="none" accessibilityRole="text" accessibilityLabel={messages.join('. ')}>
      <Animated.View style={[s.track, { transform: [{ translateX: x }] }]}>
        <Text style={s.text} numberOfLines={1} onLayout={(event: LayoutChangeEvent) => setTextWidth(Math.round(event.nativeEvent.layout.width))}>{text}</Text>
        <Text style={s.text} numberOfLines={1}>{text}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  band: { height: 44, borderRadius: 12, overflow: 'hidden', zIndex: 20, elevation: 20, backgroundColor: '#1B1230', borderWidth: 1, borderColor: '#7C5CFC', justifyContent: 'center', marginHorizontal: 2, marginBottom: 10 },
  track: { flexDirection: 'row', alignItems: 'center', width: 4000 },
  text: { color: '#FFFFFF', fontSize: 17, lineHeight: 24, fontWeight: '800', letterSpacing: 0.3 },
});
