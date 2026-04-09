import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUpload } from '../context/UploadContext';

export default function UploadProgressPill() {
  const { upload, cancelUpload } = useUpload();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (!upload) return null;

  const { completed, total, isUploading, sessionName } = upload;
  const progress = total > 0 ? completed / total : 0;
  const label = isUploading
    ? `Uploading ${completed}/${total}...`
    : `${completed} photo${completed !== 1 ? 's' : ''} uploaded`;

  return (
    <View style={[s.container, { backgroundColor: isDark ? '#1f2937' : '#111827' }]}>
      {/* Progress bar background */}
      <View style={[s.progressBar, { width: `${progress * 100}%` }]} />

      {/* Content */}
      <View style={s.content}>
        <Ionicons
          name={isUploading ? 'cloud-upload-outline' : 'checkmark-circle'}
          size={16}
          color={isUploading ? '#60a5fa' : '#22c55e'}
        />
        <Text style={s.label} numberOfLines={1}>{label}</Text>
        {isUploading && (
          <Pressable onPress={cancelUpload} hitSlop={8} style={s.cancelBtn}>
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
    bottom: 90,
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
  label: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  cancelBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
