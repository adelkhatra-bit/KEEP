import React, { useRef } from 'react';
import { FlatList, NativeSyntheticEvent, NativeScrollEvent, StyleSheet, Text, View } from 'react-native';

// Adel (08/09/2026) : "arrete d'utiliser [des boutons d'heures] ... mets un
// systeme de roulette pour la date et l'heure ... je veux pouvoir
// selectionner une heure et 45 minutes, 2h14, etc." -- roulette generique
// (FlatList qui s'aimante case par case), pas de nouvelle dependance native,
// aucune valeur imposee par defaut au-dela de la position de defilement
// initiale : tout est modifiable en faisant defiler.
const ITEM_HEIGHT = 40;
const VISIBLE_COUNT = 5;

type WheelPickerProps = {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  width?: number;
};

export default function WheelPicker({ items, selectedIndex, onChange, width = 90 }: WheelPickerProps) {
  const listRef = useRef<FlatList<string>>(null);

  const snapTo = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_HEIGHT)));
    if (index !== selectedIndex) onChange(index);
    listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: true });
  };

  return (
    <View style={[styles.container, { width, height: ITEM_HEIGHT * VISIBLE_COUNT }]}>
      <View pointerEvents="none" style={styles.highlight} />
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(_, index) => String(index)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        initialScrollIndex={selectedIndex}
        onScrollToIndexFailed={({ index }) => { setTimeout(() => listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: false }), 50); }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2) }}
        onMomentumScrollEnd={snapTo}
        onScrollEndDrag={snapTo}
        renderItem={({ item, index }) => (
          <View style={styles.item}>
            <Text style={[styles.itemText, index === selectedIndex && styles.itemTextOn]} numberOfLines={1}>{item}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  highlight: { position: 'absolute', top: ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2), left: 0, right: 0, height: ITEM_HEIGHT, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#8B5CF6', backgroundColor: 'rgba(139,92,246,.12)', zIndex: 1 },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { color: '#6B6478', fontSize: 14, fontWeight: '700' },
  itemTextOn: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
});
