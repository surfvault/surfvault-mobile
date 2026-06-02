import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSave } from '../context/SaveContext';
import { useUpload } from '../context/UploadContext';

/**
 * Floating progress chip for the global "Save to camera roll" queue. Sits above
 * the UploadProgressPill so both can show at once. Mirrors UploadProgressPill.
 */
export default function SaveProgressPill() {
  const { save, cancelSave } = useSave();
  const { upload } = useUpload();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (!save) return null;

  // Yield to the upload pill: when an upload is also showing, stack just above
  // it so both stay fully visible; otherwise take the normal bottom slot.
  const bottom = upload ? 152 : 90;

  const { total, completed, failed, isSaving, fileFraction } = save;
  const overall = total > 0 ? Math.min(1, (completed + fileFraction) / total) : 0;

  const label = isSaving
    ? `Saving ${Math.min(completed + 1, total)}/${total} · ${Math.round(overall * 100)}%`
    : failed === 0
      ? `${completed} item${completed !== 1 ? 's' : ''} saved`
      : `${completed} saved · ${failed} failed`;

  return (
    <View style={[s.container, { bottom, backgroundColor: isDark ? '#1f2937' : '#111827' }]}>
      <View style={[s.progressBar, { width: `${overall * 100}%` }]} />
      <View style={s.content}>
        <Ionicons
          name={isSaving ? 'download-outline' : 'checkmark-circle'}
          size={16}
          color={isSaving ? '#60a5fa' : '#22c55e'}
        />
        <Text style={s.label} numberOfLines={1}>{label}</Text>
        {isSaving && (
          <Pressable onPress={cancelSave} hitSlop={8} style={s.cancelBtn}>
            <Ionicons name="close" size={16} color="#9ca3af" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    // `bottom` is set inline (90 normally, 152 stacked above an active upload pill).
    left: 16,
    right: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    borderRadius: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  label: { flex: 1, color: '#ffffff', fontSize: 13, fontWeight: '600' },
  cancelBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
