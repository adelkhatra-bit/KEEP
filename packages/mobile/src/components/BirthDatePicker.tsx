import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

interface Props {
  /** ISO "YYYY-MM-DD", ou undefined si non renseignée -- jamais obligatoire. */
  value?: string;
  onChange: (isoDate: string | undefined) => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_AGE = 13;
const MAX_AGE = 100;

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function parseValue(value?: string): [number | undefined, number | undefined, number | undefined] {
  if (!value) return [undefined, undefined, undefined];
  const [yy, mm, dd] = value.split('-').map(Number);
  return [dd, mm, yy];
}

type PickerField = 'day' | 'month' | 'year';

/**
 * Trois puces compactes (jour/mois/année) -- rien à taper, chaque champ se
 * choisit indépendamment (garde son choix même avant que les deux autres
 * soient renseignés -- un état "brouillon" local le permet, contrairement à
 * la première version qui exigeait les trois valeurs à la fois et ignorait
 * silencieusement toute sélection partielle, cf. bug trouvé et corrigé le
 * 22/08/2026). Remplace @react-native-picker/picker : son rendu Web
 * (<select> natif) sortait démesuré et non cliquable -- ce composant
 * réutilise le même modal générique déjà fiable partout ailleurs dans l'app
 * (voir utils/AppAlert.tsx). Toujours facultatif : "—" partout = non
 * renseignée.
 */
export default function BirthDatePicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [openField, setOpenField] = useState<PickerField | null>(null);
  const [[d, m, y], setDraft] = useState(() => parseValue(value));

  useEffect(() => {
    setDraft(parseValue(value));
  }, [value]);

  const monthLabels = [
    t('profile.monthJan'), t('profile.monthFeb'), t('profile.monthMar'), t('profile.monthApr'),
    t('profile.monthMay'), t('profile.monthJun'), t('profile.monthJul'), t('profile.monthAug'),
    t('profile.monthSep'), t('profile.monthOct'), t('profile.monthNov'), t('profile.monthDec'),
  ];

  const years = useMemo(() => {
    const list: number[] = [];
    for (let year = CURRENT_YEAR - MIN_AGE; year >= CURRENT_YEAR - MAX_AGE; year--) list.push(year);
    return list;
  }, []);

  const days = useMemo(() => {
    const count = m && y ? daysInMonth(m, y) : 31;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [m, y]);

  const fields: { field: PickerField; label: string; options: { value: number; label: string }[] }[] = [
    { field: 'day', label: d ? String(d) : '—', options: days.map((day) => ({ value: day, label: String(day) })) },
    { field: 'month', label: m ? monthLabels[m - 1] : '—', options: monthLabels.map((label, i) => ({ value: i + 1, label })) },
    { field: 'year', label: y ? String(y) : '—', options: years.map((year) => ({ value: year, label: String(year) })) },
  ];

  const activeOptions = fields.find((f) => f.field === openField);

  const selectValue = (field: PickerField, v: number) => {
    const nextD = field === 'day' ? v : d;
    const nextM = field === 'month' ? v : m;
    const nextY = field === 'year' ? v : y;
    setDraft([nextD, nextM, nextY]);
    setOpenField(null);
    if (nextD && nextM && nextY) {
      const clampedDay = Math.min(nextD, daysInMonth(nextM, nextY));
      onChange(`${nextY}-${String(nextM).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`);
    }
  };

  const clear = () => {
    setDraft([undefined, undefined, undefined]);
    onChange(undefined);
    setOpenField(null);
  };

  return (
    <View style={styles.row}>
      {fields.map((f) => (
        <TouchableOpacity key={f.field} style={styles.chip} onPress={() => setOpenField(f.field)}>
          <Text style={styles.chipText} numberOfLines={1}>{f.label}</Text>
        </TouchableOpacity>
      ))}

      <Modal visible={openField !== null} transparent animationType="fade" onRequestClose={() => setOpenField(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpenField(null)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView style={styles.list}>
              {activeOptions?.options.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.option}
                  onPress={() => openField && selectValue(openField, opt.value)}
                >
                  <Text style={styles.optionText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.clearBtn} onPress={clear}>
              <Text style={styles.clearBtnText}>{t('profile.clearBirthDate')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 56,
    alignItems: 'center',
  },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.xl },
  sheet: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 320,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    overflow: 'hidden',
  },
  list: { maxHeight: 260 },
  option: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { ...typography.body, color: colors.textPrimary, textAlign: 'center' },
  clearBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  clearBtnText: { color: colors.primaryLight, fontWeight: '700', fontSize: 13 },
});
