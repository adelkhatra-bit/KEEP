import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const DEFAULT_SIZE = 72;
const WAVE_BAR_COUNT = 5;

/**
 * Animation "session en cours" -- v3 (23/08/2026). La v2 (32 barres en
 * roue/spokes) a été jugée "pas classe" et trop grande une fois en session
 * (cachait les morceaux à valider). Nouveau parti pris, esprit indicateur
 * d'écoute premium (type Siri) plutôt que roue de chargement : un halo qui
 * respire + deux fins anneaux en orbite (arcs, pas des bâtonnets qui
 * dépassent) + une mini vague de {WAVE_BAR_COUNT} barres au centre. Compact
 * par défaut (72px) -- jamais la pièce maîtresse de l'écran, un indicateur.
 *
 * `level` (0-1, optionnel) = niveau micro réel en direct (voir
 * services/micCapture.ts) -- fait réagir la mini vague au son détecté. Sans
 * lui (Mode Démo, ou metering indisponible), la vague respire doucement en
 * boucle -- jamais une fausse activité présentée comme réelle.
 *
 * API `Animated` du cœur React Native (pas react-native-reanimated, qui ne
 * s'animait pas du tout sur Web -- confirmé le 22/08/2026).
 */
export default function SessionPulse({ active = true, level, size = DEFAULT_SIZE }: { active?: boolean; level?: number; size?: number }) {
  const SIZE = size;
  const CENTER = SIZE / 2;
  const scale = SIZE / DEFAULT_SIZE;
  const CORE_RADIUS = 16 * scale;
  const RING_R_OUTER = 33 * scale;
  const RING_R_INNER = 26 * scale;
  const WAVE_MAX_HEIGHT = 14 * scale;

  const rotationA = useRef(new Animated.Value(0)).current;
  const rotationB = useRef(new Animated.Value(0)).current;
  const corePulse = useRef(new Animated.Value(0)).current;
  const waveBars = useRef(Array.from({ length: WAVE_BAR_COUNT }, () => new Animated.Value(0.25))).current;
  const isLive = typeof level === 'number';

  useEffect(() => {
    if (!active) return undefined;

    const rotateA = Animated.loop(
      Animated.timing(rotationA, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true })
    );
    const rotateB = Animated.loop(
      Animated.timing(rotationB, { toValue: 1, duration: 13000, easing: Easing.linear, useNativeDriver: true })
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(corePulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(corePulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    rotateA.start();
    rotateB.start();
    pulse.start();
    return () => {
      rotateA.stop();
      rotateB.stop();
      pulse.stop();
    };
  }, [active, rotationA, rotationB, corePulse]);

  // Respiration décorative de la mini vague -- seulement sans niveau micro réel.
  useEffect(() => {
    if (!active || isLive) return undefined;
    const loops = waveBars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 90),
          Animated.timing(bar, { toValue: 0.9, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(bar, { toValue: 0.2, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, isLive, waveBars]);

  // Vague pilotée par le niveau micro réel. Courbe racine carrée (pas
  // linéaire) -- BUG RÉEL trouvé le 24/08/2026 : les niveaux micro réels
  // observés en direct tournent autour de 0.03-0.06 (musique captée à
  // distance normale, pas collée au micro) ; un mapping linéaire ne
  // produisait qu'un mouvement de quelques % (0.15 -> ~0.18), invisible à
  // l'œil -- l'animation SEMBLAIT morte alors que le niveau était bien reçu
  // en direct. sqrt() amplifie fortement les niveaux faibles/réalistes tout
  // en restant borné à 1 pour un son fort, sans jamais inventer d'activité :
  // niveau 0 reste visuellement au repos.
  useEffect(() => {
    if (!isLive) return;
    const raw = Math.max(0, Math.min(1, level as number));
    // BUG RÉEL trouvé le 24/08/2026 (Adel, test réel : "le micro a l'air
    // mort" pendant le silence) : sous SILENCE_FLOOR, `target` retombait à un
    // 0 exact -- les barres se figeaient à une position plate (0.15), chaque
    // nouvel appel onLevel(~0) (toutes les ~93-150ms, voir micCapture.ts)
    // retimant vers CETTE MÊME valeur ne produisait donc plus aucun
    // mouvement visible, indiscernable d'un micro mort à l'œil. Respiration
    // sinusoïdale légère (amplitude ~0.05, jamais assez pour ressembler à du
    // son réel) tant que le niveau reste sous le seuil -- confirme "j'écoute"
    // sans jamais inventer une activité sonore qui n'existe pas ; dès qu'un
    // vrai niveau dépasse SILENCE_FLOOR, la courbe sqrt() réactive reprend
    // la main immédiatement (comportement inchangé).
    const SILENCE_FLOOR = 0.02;
    const target = raw < SILENCE_FLOOR ? 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(Date.now() / 900)) : Math.sqrt(raw);
    const animations = waveBars.map((bar, i) => {
      const weight = i === 2 ? 1 : i === 1 || i === 3 ? 0.75 : 0.5;
      return Animated.timing(bar, { toValue: 0.15 + target * weight * 0.85, duration: 110, easing: Easing.out(Easing.ease), useNativeDriver: false });
    });
    Animated.parallel(animations).start();
  }, [level, isLive, waveBars]);

  const rotateDegA = rotationA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateDegB = rotationB.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const coreRadius = corePulse.interpolate({ inputRange: [0, 1], outputRange: [CORE_RADIUS - 2, CORE_RADIUS + 2] });
  const coreOpacity = corePulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });

  const ringOuterCircumference = 2 * Math.PI * RING_R_OUTER;
  const ringInnerCircumference = 2 * Math.PI * RING_R_INNER;

  return (
    <View style={[styles.container, { width: SIZE, height: SIZE }]}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.keep} stopOpacity={0.55} />
            <Stop offset="60%" stopColor={colors.primary} stopOpacity={0.28} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <AnimatedCircle cx={CENTER} cy={CENTER} r={coreRadius} fill="url(#halo)" opacity={coreOpacity} />
        <Circle
          cx={CENTER} cy={CENTER} r={CORE_RADIUS - 5}
          fill={colors.backgroundCard} stroke={colors.primaryLight} strokeWidth={1} opacity={0.9}
        />
      </Svg>

      {/* Anneau extérieur -- un fin arc en orbite, jamais un cercle complet ni des bâtonnets ("roue") -- lecture "indicateur d'écoute" premium. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotateDegA }] }]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={CENTER} cy={CENTER} r={RING_R_OUTER}
            stroke={colors.keep} strokeWidth={1.5} fill="none" strokeLinecap="round"
            strokeDasharray={`${ringOuterCircumference * 0.22} ${ringOuterCircumference}`}
            opacity={0.85}
          />
        </Svg>
      </Animated.View>

      {/* Anneau intérieur -- sens et vitesse opposés pour un effet "orbite" plutôt qu'un simple spinner. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotateDegB }] }]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={CENTER} cy={CENTER} r={RING_R_INNER}
            stroke={colors.primaryLight} strokeWidth={1} fill="none" strokeLinecap="round"
            strokeDasharray={`${ringInnerCircumference * 0.14} ${ringInnerCircumference}`}
            opacity={0.55}
          />
        </Svg>
      </Animated.View>

      <View style={styles.waveRow}>
        {waveBars.map((bar, i) => (
          <Wave key={i} progress={bar} maxHeight={WAVE_MAX_HEIGHT} />
        ))}
      </View>
    </View>
  );
}

function Wave({ progress, maxHeight }: { progress: Animated.Value; maxHeight: number }) {
  const height = progress.interpolate({ inputRange: [0, 1], outputRange: [Math.max(2, maxHeight * 0.18), maxHeight] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  return <Animated.View style={[styles.waveBar, { height, opacity }]} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  waveBar: {
    width: 2.5,
    borderRadius: 2,
    backgroundColor: colors.keep,
  },
});
