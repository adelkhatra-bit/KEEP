import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { colors } from '../theme/colors';
import KeepModal from './KeepModal';

interface KidsModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  emoji?: string;
  children?: React.ReactNode;
  confirmText?: string;
  confirmEmoji?: string;
  onConfirm?: () => void;
  cancelText?: string;
  cancelEmoji?: string;
}

export default function KidsModal({
  visible,
  onClose,
  title,
  emoji = '💬',
  children,
  confirmText = 'OK',
  confirmEmoji = '✓',
  onConfirm,
  cancelText = 'Annuler',
  cancelEmoji = '✕',
}: KidsModalProps) {
  return (
    <KeepModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.backdrop} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>{emoji}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>

          <View style={styles.content}>
            {children}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={() => {
                onConfirm?.();
                onClose();
              }}
            >
              <Text style={styles.confirmText}>{confirmEmoji} {confirmText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>{cancelEmoji} {cancelText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </KeepModal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 32,
    zIndex: 1000,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  content: {
    marginBottom: 20,
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  cancelButton: {
    backgroundColor: '#F0F0F0',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});
