import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  Alert,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
let ImageManipulator: any = null;
try { ImageManipulator = require('expo-image-manipulator'); } catch {}
import { useUser } from '../../src/context/UserProvider';
import { useSmartBack } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import {
  useUpdateUserMetaDataMutation,
  useUpdateUserHandleMutation,
  useDoesHandleExistQuery,
  useGetPopularTagsQuery,
} from '../../src/store';
import UserAvatar from '../../src/components/UserAvatar';

export default function EditProfileScreen() {
  const router = useRouter();
  const smartBack = useSmartBack();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();

  const [updateMeta, { isLoading: saving }] = useUpdateUserMetaDataMutation();
  const [updateHandle] = useUpdateUserHandleMutation();

  // Form state
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [website, setWebsite] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [profilePicUri, setProfilePicUri] = useState<string | null>(null);
  const [profilePicFile, setProfilePicFile] = useState<any>(null);

  // Handle validation
  const [handleChanged, setHandleChanged] = useState(false);
  const { data: handleCheckData, isFetching: checkingHandle } = useDoesHandleExistQuery(
    { handle },
    { skip: !handleChanged || handle.length < 3 || handle === user?.handle }
  );
  // API returns results.success === true when handle is AVAILABLE,
  // results.success === false when it's already taken.
  const handleExists =
    handleCheckData?.results?.success === false && handle !== user?.handle;
  const isHandleValid = handle.length >= 3 && /^[a-zA-Z0-9._-]+$/.test(handle);

  // Popular tags
  const { data: tagsData } = useGetPopularTagsQuery(undefined);
  const popularTags = (tagsData?.results?.tags ?? []).map((t: any) => t.tag ?? t);

  // Read directly from the server record. user_type isn't editable from this
  // screen — switching types isn't a valid product transition for end users.
  const userType = (user as any)?.user_type ?? (user as any)?.type;
  const isPhotographer = userType === 'photographer';
  // Shapers are always public; the access toggle is hidden for them and
  // enforced server-side in services/user/handler.ts.
  const isShaper = userType === 'shaper';

  // Initialize form from user data
  useEffect(() => {
    if (user) {
      setName((user.name as string) ?? '');
      setHandle(user.handle ?? '');
      setBio((user.bio as string) ?? '');
      setInstagram((user.instagram as string) ?? '');
      setYoutube((user.youtube as string) ?? '');
      setWebsite((user.website as string) ?? '');
      setIsPrivate(user.access === 'private');
      setTags((user.tags as string[]) ?? []);
      setProfilePicUri(user.picture ?? null);
    }
  }, [user]);

  // Pick profile picture
  const handlePickPicture = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // Compress to 512px if manipulator available
      if (ImageManipulator?.manipulateAsync) {
        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 512, height: 512 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat?.JPEG ?? 'jpeg' }
        );
        setProfilePicUri(manipulated.uri);
        setProfilePicFile(manipulated);
      } else {
        setProfilePicUri(asset.uri);
        setProfilePicFile({ uri: asset.uri });
      }
    }
  }, []);

  // Add tag
  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag) && tags.length < 10) {
      setTags((prev) => [...prev, tag]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    if (!user) return;

    // Build changed fields
    const metaData: Record<string, any> = {};

    if (name !== (user.name ?? '')) metaData.name = name;
    if (bio !== (user.bio ?? '')) metaData.bio = bio;
    if (instagram !== (user.instagram ?? '')) metaData.instagram = instagram;
    if (youtube !== (user.youtube ?? '')) metaData.youtube = youtube;
    if (website !== (user.website ?? '')) metaData.website = website;
    if (isPrivate !== (user.access === 'private')) metaData.access = isPrivate ? 'private' : 'public';

    const currentTags = (user.tags as string[]) ?? [];
    if (JSON.stringify(tags.sort()) !== JSON.stringify(currentTags.sort())) {
      metaData.tags = tags;
    }

    // Handle change
    if (handleChanged && handle !== user.handle && isHandleValid && !handleExists) {
      try {
        await updateHandle({ handle }).unwrap();
      } catch {
        Alert.alert('Error', 'Failed to update handle.');
        return;
      }
    }

    // Update metadata
    if (Object.keys(metaData).length > 0 || profilePicFile) {
      try {
        const result = await updateMeta({ metaData: { ...metaData, ...(profilePicFile ? { picture: 'updating' } : {}) } }).unwrap();

        // Upload profile pic if changed
        if (profilePicFile && result?.results?.profilePicPresignedUrl) {
          const presignedUrl = result.results.profilePicPresignedUrl;
          const response = await fetch(profilePicFile.uri);
          const blob = await response.blob();
          await fetch(presignedUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': 'image/jpeg' },
          });
        }
      } catch {
        Alert.alert('Error', 'Failed to save profile changes.');
        return;
      }
    }

    smartBack();
  }, [user, name, bio, instagram, youtube, website, isPrivate, tags, handle, handleChanged, isHandleValid, handleExists, profilePicFile, updateMeta, updateHandle, smartBack]);

  const inputStyle = (isDark: boolean) => [
    s.input,
    { backgroundColor: isDark ? '#1f2937' : '#f3f4f6', color: isDark ? '#fff' : '#111827' },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Edit Profile"
        left={
          <Pressable onPress={smartBack} hitSlop={8}>
            <Text style={{ fontSize: 16, color: '#007AFF' }}>Cancel</Text>
          </Pressable>
        }
        right={
          <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
            {saving ? (
              <ActivityIndicator size="small" color="#0ea5e9" />
            ) : (
              <Text style={{ fontSize: 16, color: '#0ea5e9', fontWeight: '600' }}>Save</Text>
            )}
          </Pressable>
        }
      />
      <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#000000' : '#fff' }]} edges={[]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>

            {/* Profile Picture */}
            <View style={s.picSection}>
              <Pressable onPress={handlePickPicture}>
                {profilePicUri ? (
                  <Image source={{ uri: profilePicUri }} style={s.picImage} contentFit="cover" />
                ) : (
                  <View style={[s.picImage, s.picPlaceholder, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                    <Ionicons name="person" size={40} color={isDark ? '#4b5563' : '#9ca3af'} />
                  </View>
                )}
                <View style={s.picEditBadge}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              </Pressable>
              <Pressable onPress={handlePickPicture}>
                <Text style={{ color: '#0ea5e9', fontSize: 14, fontWeight: '600', marginTop: 8 }}>Change Photo</Text>
              </Pressable>
            </View>

            {/* Handle */}
            <View style={s.field}>
              <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Handle</Text>
              <TextInput
                value={handle}
                onChangeText={(t) => { setHandle(t.replace(/[^a-zA-Z0-9._-]/g, '')); setHandleChanged(true); }}
                placeholder="your-handle"
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputStyle(isDark)}
              />
              {handleChanged && handle !== user?.handle && handle.length >= 3 && (
                <View style={s.handleStatus}>
                  {checkingHandle ? (
                    <ActivityIndicator size="small" />
                  ) : handleExists ? (
                    <Text style={{ color: '#ef4444', fontSize: 12 }}>Handle taken</Text>
                  ) : isHandleValid ? (
                    <Text style={{ color: '#10b981', fontSize: 12 }}>Available</Text>
                  ) : (
                    <Text style={{ color: '#ef4444', fontSize: 12 }}>Letters, numbers, . _ - only</Text>
                  )}
                </View>
              )}
            </View>

            {/* Name */}
            <View style={s.field}>
              <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                style={inputStyle(isDark)}
              />
            </View>

            {/* Bio */}
            <View style={s.field}>
              <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Tell people about yourself"
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                multiline
                maxLength={300}
                style={[...inputStyle(isDark), s.bioInput]}
              />
              <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, textAlign: 'right' }}>
                {bio.length}/300
              </Text>
            </View>

            {/* Tags (photographer only) */}
            {isPhotographer && (
              <View style={s.field}>
                <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Tags</Text>
                <View style={s.tagsWrap}>
                  {tags.map((tag) => (
                    <Pressable key={tag} onPress={() => handleRemoveTag(tag)} style={[s.tagChip, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#eef2ff' }]}>
                      <Text style={{ fontSize: 12, color: isDark ? '#a5b4fc' : '#4338ca' }}>{tag}</Text>
                      <Ionicons name="close" size={12} color={isDark ? '#a5b4fc' : '#4338ca'} />
                    </Pressable>
                  ))}
                </View>
                <View style={[s.tagInputRow, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                  <TextInput
                    value={tagInput}
                    onChangeText={setTagInput}
                    onSubmitEditing={handleAddTag}
                    placeholder="Add a tag..."
                    placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                    autoCapitalize="none"
                    style={[s.tagInput, { color: isDark ? '#fff' : '#111827' }]}
                  />
                  {tagInput.trim() && (
                    <Pressable onPress={handleAddTag}>
                      <Ionicons name="add-circle" size={24} color="#0ea5e9" />
                    </Pressable>
                  )}
                </View>
                {/* Popular tag suggestions */}
                {popularTags.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.suggestedTags}>
                    {popularTags.filter((t: string) => !tags.includes(t)).slice(0, 8).map((tag: string) => (
                      <Pressable key={tag} onPress={() => {
                        if (!tags.includes(tag) && tags.length < 10) setTags((prev) => [...prev, tag]);
                      }} style={[s.suggestedChip, { borderColor: isDark ? '#374151' : '#e5e7eb' }]}>
                        <Text style={{ fontSize: 11, color: isDark ? '#9ca3af' : '#6b7280' }}>{tag}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Social Links */}
            <View style={s.field}>
              <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Instagram</Text>
              <View style={[s.socialRow, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                <Ionicons name="logo-instagram" size={18} color="#ec4899" />
                <TextInput
                  value={instagram}
                  onChangeText={setInstagram}
                  placeholder="username"
                  placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[s.socialInput, { color: isDark ? '#fff' : '#111827' }]}
                />
              </View>
            </View>

            <View style={s.field}>
              <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>YouTube</Text>
              <View style={[s.socialRow, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                <Ionicons name="logo-youtube" size={18} color="#ef4444" />
                <TextInput
                  value={youtube}
                  onChangeText={setYoutube}
                  placeholder="channel name"
                  placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[s.socialInput, { color: isDark ? '#fff' : '#111827' }]}
                />
              </View>
            </View>

            <View style={s.field}>
              <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Website</Text>
              <View style={[s.socialRow, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                <Ionicons name="link-outline" size={18} color="#3b82f6" />
                <TextInput
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://your-website.com"
                  placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={[s.socialInput, { color: isDark ? '#fff' : '#111827' }]}
                />
              </View>
            </View>

            {/* Privacy — hidden for shapers (always public). */}
            {!isShaper && (
              <View style={s.field}>
                <View style={s.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151', marginBottom: 0 }]}>Private Account</Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af', marginTop: 2 }}>
                      Only approved users can view your sessions
                    </Text>
                  </View>
                  <Switch
                    value={isPrivate}
                    onValueChange={setIsPrivate}
                    trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#0ea5e9' }}
                  />
                </View>
                {isPrivate !== (user?.access === 'private') && (
                  <View style={[s.warningBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb', borderColor: isDark ? 'rgba(245,158,11,0.2)' : '#fde68a' }]}>
                    <Ionicons name="warning-outline" size={16} color="#f59e0b" />
                    <Text style={{ fontSize: 12, color: '#92400e', flex: 1, marginLeft: 6 }}>
                      Changing access triggers a migration of your photos. This can take several minutes.
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  picSection: { alignItems: 'center', marginBottom: 20 },
  picImage: { width: 96, height: 96, borderRadius: 48 },
  picPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  picEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  bioInput: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  handleStatus: { marginTop: 4, marginLeft: 2 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  tagInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4,
  },
  tagInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  suggestedTags: { gap: 6, paddingTop: 8 },
  suggestedChip: {
    borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  socialRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4,
    gap: 8,
  },
  socialInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 12,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8,
    marginTop: 8,
  },
});
