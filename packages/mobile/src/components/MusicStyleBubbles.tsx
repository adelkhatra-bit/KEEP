import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { lokiText } from '../theme/lokiText';


type Props = {
  genres: string[];
  title?: string;
  max?: number;
  compact?: boolean;
  onPressGenre?: (genre: string) => void;
  testID?: string;
};

function cleanGenres(genres: string[], max: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of genres) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

export default function MusicStyleBubbles({
  genres,
  title,
  max = 8,
  compact = false,
  onPressGenre,
  testID,
}: Props) {
  const items = useMemo(() => cleanGenres(genres, max), [genres, max]);
  if (!items.length) return null;

  return (
    <View testID={testID} style={[s.wrap, compact && s.wrapCompact]}>
      {title ? <Text style={s.title}>{title}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.rail}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((genre) => {
          const bubble = (
            <View style={[s.bubble, compact && s.bubbleCompact]}>
              <View style={s.dot} />
              <Text style={[s.text, compact && s.textCompact]} numberOfLines={1}>{genre}</Text>
            </View>
          );
          return onPressGenre ? (
            <TouchableOpacity
              key={genre}
              activeOpacity={0.78}
              onPress={() => onPressGenre(genre)}
              accessibilityRole="button"
              accessibilityLabel={`Style musical ${genre}`}
            >
              {bubble}
            </TouchableOpacity>
          ) : <View key={genre}>{bubble}</View>;
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{width:'100%',marginTop:9},
  wrapCompact:{marginTop:7},
  title:{color:colors.primaryLight,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:.75,marginBottom:6},
  rail:{gap:7,paddingRight:18},
  bubble:{minHeight:34,maxWidth:170,paddingHorizontal:11,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,flexDirection:'row',alignItems:'center',gap:7},
  bubbleCompact:{minHeight:30,paddingHorizontal:9,borderRadius:15},
  dot:{width:6,height:6,borderRadius:3,backgroundColor:colors.keep},
  text:{color:colors.textPrimary,fontSize:12.5,fontWeight:'800',maxWidth:138},
  textCompact:{fontSize:11.5,maxWidth:126},
});
