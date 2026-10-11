import React from 'react';
import { TouchableOpacity, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../theme/colors';

interface KidsButtonProps {
  onPress: () => void;
  title: string;
  disabled?: boolean;
  variant?: 'primary' | 'success' | 'danger' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  emoji?: string;
}

export default function KidsButton({
  onPress,
  title,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  style,
  textStyle,
  emoji,
}: KidsButtonProps) {
  const variantStyles: Record<string, any> = {
    primary: { backgroundColor: colors.primary, color: '#FFFFFF' },
    success: { backgroundColor: colors.success, color: '#FFFFFF' },
    danger: { backgroundColor: colors.danger, color: '#FFFFFF' },
    secondary: { backgroundColor: '#E0E0E0', color: '#333' },
  };

  const sizeStyles: Record<string, any> = {
    small: { paddingVertical: 8, paddingHorizontal: 12, fontSize: 12 },
    medium: { paddingVertical: 16, paddingHorizontal: 20, fontSize: 14 },
    large: { paddingVertical: 20, paddingHorizontal: 24, fontSize: 16 },
  };

  const variant_config = variantStyles[variant];
  const size_config = sizeStyles[size];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: disabled ? '#CCCCCC' : variant_config.backgroundColor,
          paddingVertical: size_config.paddingVertical,
          paddingHorizontal: size_config.paddingHorizontal,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.text,
          {
            color: disabled ? '#999' : variant_config.color,
            fontSize: size_config.fontSize,
          },
          textStyle,
        ]}
      >
        {emoji && `${emoji} `}
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginVertical: 8,
  },
  text: {
    fontWeight: '600',
  },
});
