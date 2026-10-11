import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAlertStore } from '../store/useAlertStore';
import { AlertCard } from './AlertHost';

let layerCounter = 0;

/**
 * Couche d'alerte à placer À L'INTÉRIEUR d'une fenêtre Modal (Adel, 05/10/2026) : l'alerte s'affiche par-dessus la fenêtre ouverte
 * (jamais cachée derrière). La couche la plus récemment montée affiche ; sans couche, la fenêtre racine (AlertHost) s'en charge.
 */
export default function ModalAlertLayer() {
  const idRef = useRef(`layer-${++layerCounter}`);
  const current = useAlertStore((state) => state.current);
  const hide = useAlertStore((state) => state.hide);
  const stack = useAlertStore((state) => state.hostStack);
  useEffect(() => useAlertStore.getState().registerHost(idRef.current), []);
  const isTop = stack[stack.length - 1] === idRef.current;
  if (!current || !isTop) return null;
  const press = (onPress?: () => void) => { hide(); onPress?.(); };
  return (
    <View style={s.layer} pointerEvents="box-none" testID="modal-alert-layer">
      <AlertCard current={current} press={press} />
    </View>
  );
}

const s = StyleSheet.create({ layer: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 } });
