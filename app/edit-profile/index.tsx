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
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT, type Region, type LatLng } from 'react-native-maps';
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
  useUpdateMyAdPartnerMutation,
  useGetSelfQuery,
} from '../../src/store';
import UserAvatar from '../../src/components/UserAvatar';
import {
  MAX_PAYMENT_CHANNELS,
  PAYMENT_CHANNEL_META,
  PAYMENT_CHANNEL_TYPES,
  type PaymentChannel,
} from '../../src/helpers/paymentChannels';

export default function EditProfileScreen() {
  const router = useRouter();
  const smartBack = useSmartBack();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  // Pull a fresh self record when the editor opens. The context `user` can be a
  // stale getSelf cache (e.g. edits made on web don't invalidate this client),
  // which would seed the form with out-of-date payment channels / fields. This
  // refetch updates the shared getSelf cache → the init effect reseeds.
  useGetSelfQuery(undefined, { refetchOnMountOrArgChange: true });

  const [updateMeta, { isLoading: saving }] = useUpdateUserMetaDataMutation();
  const [updateHandle] = useUpdateUserHandleMutation();
  const [updateMyAdPartner, { isLoading: savingAdPartner }] = useUpdateMyAdPartnerMutation();

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
  // Payment channels (photographer/shaper only). Off-platform payment handles
  // shown on the profile; SurfVault processes no money.
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);
  const [acceptsDonations, setAcceptsDonations] = useState(false);
  const [profilePicUri, setProfilePicUri] = useState<string | null>(null);
  const [profilePicFile, setProfilePicFile] = useState<any>(null);

  // Advertiser-only — backs the satellite ad_partners row. getSelf inlines
  // it as `user.adPartner`. Logo upload is deferred (needs presigned-URL
  // plumbing on a self-service path); the user's avatar above doubles as
  // the brand logo for now.
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [radiusKm, setRadiusKm] = useState('');

  // Map picker for the business pin. `pendingPin` holds the in-modal selection
  // until the advertiser confirms; only then does it commit to lat/lon.
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [pendingPin, setPendingPin] = useState<LatLng | null>(null);

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
  const isAdvertiser = userType === 'advertiser';
  const canEditAccess = userType === 'photographer' || userType === 'surfer';

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
      setPaymentChannels(Array.isArray((user as any)?.payment_channels) ? (user as any).payment_channels : []);
      setAcceptsDonations(Boolean((user as any)?.accepts_donations));
      setProfilePicUri(user.picture ?? null);

      const ap = (user as any)?.adPartner;
      setCompanyName(ap?.companyName ?? '');
      setContactName(ap?.contactName ?? '');
      setPhoneNumber(ap?.phoneNumber ?? '');
      setLat(ap?.coordinates?.lat != null ? String(ap.coordinates.lat) : '');
      setLon(ap?.coordinates?.lon != null ? String(ap.coordinates.lon) : '');
      setRadiusKm(ap?.targetRadiusKm != null ? String(ap.targetRadiusKm) : '');
    }
  }, [user]);

  // Pick profile picture
  const handlePickPicture = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library.');
        return;
      }

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
    } catch (err) {
      console.error('Failed to pick profile picture:', err);
      Alert.alert('Could not pick photo', 'Something went wrong opening your photos. Please try again.');
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

    // Payment channels — only diffed for eligible types (the section is hidden
    // otherwise, and the server 403s payment_channels for other user types).
    if (isPhotographer || isShaper) {
      // Drop empty-handle rows before comparing/sending; the server also drops
      // them, so this keeps the diff from looking changed on a no-op.
      const cleanedChannels = paymentChannels
        .map((c) => ({ ...c, handle: (c.handle ?? '').trim() }))
        .filter((c) => c.handle.length > 0);
      const currentChannels = Array.isArray((user as any)?.payment_channels)
        ? (user as any).payment_channels
        : [];
      if (JSON.stringify(cleanedChannels) !== JSON.stringify(currentChannels)) {
        metaData.payment_channels = cleanedChannels;
      }
      if (acceptsDonations !== Boolean((user as any)?.accepts_donations)) {
        metaData.accepts_donations = acceptsDonations;
      }
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

    // Advertiser-only ad-partner upsert. Diff against the snapshot on
    // user.adPartner; only send what changed. Coordinates flatten lat/lon
    // back into the jsonb shape the backend expects.
    if (isAdvertiser) {
      const ap = (user as any)?.adPartner ?? {};
      const trimOrNull = (v: string) => {
        const s = (v ?? '').trim();
        return s.length ? s : null;
      };
      const adPartnerPayload: Record<string, any> = {};

      if (companyName.trim() && companyName.trim() !== (ap.companyName ?? '')) {
        adPartnerPayload.company_name = companyName.trim();
      }
      if (contactName !== (ap.contactName ?? '')) {
        adPartnerPayload.contact_name = trimOrNull(contactName);
      }
      if (phoneNumber !== (ap.phoneNumber ?? '')) {
        adPartnerPayload.phone_number = trimOrNull(phoneNumber);
      }
      const curLat = ap.coordinates?.lat != null ? String(ap.coordinates.lat) : '';
      const curLon = ap.coordinates?.lon != null ? String(ap.coordinates.lon) : '';
      if (lat !== curLat || lon !== curLon) {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (Number.isFinite(latNum) && Number.isFinite(lonNum)) {
          adPartnerPayload.coordinates = { lat: latNum, lon: lonNum };
        } else if (lat === '' && lon === '') {
          adPartnerPayload.coordinates = {};
        }
      }
      const curRadius = ap.targetRadiusKm != null ? String(ap.targetRadiusKm) : '';
      if (radiusKm !== curRadius) {
        const r = parseInt(radiusKm, 10);
        if (Number.isFinite(r) && r > 0) {
          adPartnerPayload.target_radius_km = r;
        }
      }

      if (Object.keys(adPartnerPayload).length > 0) {
        try {
          await updateMyAdPartner(adPartnerPayload).unwrap();
        } catch {
          Alert.alert('Error', 'Failed to save business details.');
          return;
        }
      }
    }

    smartBack();
  }, [user, name, bio, instagram, youtube, website, isPrivate, tags, paymentChannels, acceptsDonations, isPhotographer, isShaper, handle, handleChanged, isHandleValid, handleExists, profilePicFile, isAdvertiser, companyName, contactName, phoneNumber, lat, lon, radiusKm, updateMeta, updateHandle, updateMyAdPartner, smartBack]);

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
          <Pressable onPress={handleSave} disabled={saving || savingAdPartner} hitSlop={8}>
            {saving || savingAdPartner ? (
              <ActivityIndicator size="small" color="#0ea5e9" />
            ) : (
              <Text style={{ fontSize: 16, color: '#0ea5e9', fontWeight: '600' }}>Save</Text>
            )}
          </Pressable>
        }
      />
      <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#000000' : '#fff' }]} edges={[]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={s.scroll}
          >

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

            {/* Profile visibility — Public/Private segment. Only surfers/photographers
                can toggle; shapers are always public, advertisers hidden. */}
            {canEditAccess && (
              <View style={s.field}>
                <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Profile visibility</Text>
                <View style={[s.segment, {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                }]}>
                  {([
                    { val: false, label: 'Public', icon: 'earth' as const },
                    { val: true, label: 'Private', icon: 'lock-closed' as const },
                  ]).map((opt) => {
                    const active = isPrivate === opt.val;
                    return (
                      <Pressable
                        key={String(opt.val)}
                        onPress={() => setIsPrivate(opt.val)}
                        style={[s.segmentItem, active && { backgroundColor: '#0ea5e9' }]}
                      >
                        <Ionicons name={opt.icon} size={14} color={active ? '#fff' : (isDark ? '#9ca3af' : '#6b7280')} />
                        <Text style={[s.segmentText, { color: active ? '#fff' : (isDark ? '#9ca3af' : '#6b7280') }]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af', marginTop: 6 }}>
                  {isPrivate ? 'Only approved users can view your sessions.' : 'Anyone can view your sessions.'}
                </Text>
                {isPrivate !== (user?.access === 'private') && (
                  <View style={[s.warningBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fffbeb', borderColor: '#f59e0b' }]}>
                    <Ionicons name="warning" size={18} color="#f59e0b" />
                    <Text style={{ fontSize: 13, fontWeight: '600', lineHeight: 18, color: isDark ? '#fcd34d' : '#92400e', flex: 1, marginLeft: 8 }}>
                      {isPrivate
                        ? 'Going private hides your sessions from Discover and surf break feeds. Only approved users will see them.'
                        : 'Going public surfaces your sessions on Discover and surf break feeds for anyone to see.'}
                    </Text>
                  </View>
                )}
              </View>
            )}

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
                maxLength={30}
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

            {/* Business (advertiser only) — populates the satellite
                ad_partners row via PATCH /user/ad-partner. Logo upload is
                deferred; the avatar above doubles as the brand logo. */}
            {isAdvertiser && (
              <>
                <View style={s.field}>
                  <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Company name</Text>
                  <TextInput
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="Your brand name"
                    placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                    style={inputStyle(isDark)}
                  />
                </View>

                <View style={s.field}>
                  <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Contact name</Text>
                  <TextInput
                    value={contactName}
                    onChangeText={setContactName}
                    placeholder="Who we reach out to"
                    placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                    style={inputStyle(isDark)}
                  />
                </View>

                <View style={s.field}>
                  <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Phone number</Text>
                  <TextInput
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="+1 555 555 5555"
                    placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                    keyboardType="phone-pad"
                    style={inputStyle(isDark)}
                  />
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    Include your country code (e.g. +44, +61).
                  </Text>
                </View>

                <View style={s.field}>
                  <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Map location</Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af', marginBottom: 8 }}>
                    Drop a pin where your business is. It shows on the SurfVault map so nearby surfers can find you (e.g. a venue, shop, or event). Leave it unset to stay off the map.
                  </Text>
                  {(() => {
                    const latNum = parseFloat(lat);
                    const lonNum = parseFloat(lon);
                    const hasPin = Number.isFinite(latNum) && Number.isFinite(lonNum);
                    const openPicker = () => {
                      setPendingPin(hasPin ? { latitude: latNum, longitude: lonNum } : null);
                      setMapPickerVisible(true);
                    };
                    return (
                      <>
                        {/* Inline preview — pointerEvents none so it doesn't
                            steal scroll/taps; the wrapping Pressable opens the
                            full-screen picker to set/move the pin. */}
                        <Pressable onPress={openPicker} style={s.mapPreviewWrap}>
                          <MapView
                            pointerEvents="none"
                            provider={PROVIDER_DEFAULT}
                            style={StyleSheet.absoluteFill}
                            region={{
                              latitude: hasPin ? latNum : 20,
                              longitude: hasPin ? lonNum : 0,
                              latitudeDelta: hasPin ? 0.02 : 100,
                              longitudeDelta: hasPin ? 0.02 : 100,
                            } as Region}
                          >
                            {hasPin && <Marker coordinate={{ latitude: latNum, longitude: lonNum }} />}
                          </MapView>
                          <View style={s.mapPreviewBadge}>
                            <Ionicons name="location" size={13} color="#fff" />
                            <Text style={s.mapPreviewBadgeText}>{hasPin ? 'Edit location' : 'Set location'}</Text>
                          </View>
                        </Pressable>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                          <Text style={{ fontSize: 12, color: isDark ? '#9ca3af' : '#6b7280', flex: 1 }} numberOfLines={1}>
                            {hasPin ? `Pinned at ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}` : 'No location set'}
                          </Text>
                          {hasPin && (
                            <Pressable onPress={() => { setLat(''); setLon(''); }} hitSlop={8}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#0ea5e9' }}>Clear</Text>
                            </Pressable>
                          )}
                        </View>
                      </>
                    );
                  })()}
                </View>
              </>
            )}

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

            {/* Payments & tips — photographer/shaper only. Off-platform payment
                handles shown on the profile; SurfVault processes no money. */}
            {(isPhotographer || isShaper) && (
              <View style={s.field}>
                <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Payments & tips</Text>
                <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af', marginTop: -2, marginBottom: 8 }}>
                  Surfers see these on your profile and pay you directly. SurfVault doesn&apos;t process payments or take a cut.
                </Text>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
                    borderRadius: 12,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa',
                    padding: 12,
                  }}
                >
                {paymentChannels.map((channel, idx) => {
                  const updateChannel = (patch: Partial<PaymentChannel>) =>
                    setPaymentChannels((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
                  const removeChannel = () =>
                    setPaymentChannels((prev) => prev.filter((_, i) => i !== idx));
                  const meta = PAYMENT_CHANNEL_META[channel.type] ?? PAYMENT_CHANNEL_META.other;

                  return (
                    <View
                      key={idx}
                      style={{
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {PAYMENT_CHANNEL_TYPES.map((t) => {
                          const selected = channel.type === t;
                          return (
                            <Pressable
                              key={t}
                              onPress={() => updateChannel({ type: t })}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 999,
                                backgroundColor: selected ? '#0ea5e9' : (isDark ? '#1f2937' : '#f3f4f6'),
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : (isDark ? '#d1d5db' : '#374151') }}>
                                {PAYMENT_CHANNEL_META[t].label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={[s.socialRow, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                        <TextInput
                          value={channel.handle}
                          onChangeText={(handle) => updateChannel({ handle })}
                          placeholder={meta.placeholder}
                          placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={[s.socialInput, { color: isDark ? '#fff' : '#111827' }]}
                        />
                        <Pressable onPress={removeChannel} hitSlop={8}>
                          <Ionicons name="trash-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                        </Pressable>
                      </View>
                      {channel.type === 'other' && (
                        <View style={[s.socialRow, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6', marginTop: 8 }]}>
                          <Ionicons name="pricetag-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                          <TextInput
                            value={channel.label ?? ''}
                            onChangeText={(label) => updateChannel({ label })}
                            placeholder="Label (e.g. Buy Me a Coffee)"
                            placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                            style={[s.socialInput, { color: isDark ? '#fff' : '#111827' }]}
                          />
                        </View>
                      )}
                      {meta.usOnly && (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 6 }}>
                          <Ionicons name="information-circle-outline" size={13} color={isDark ? '#fbbf24' : '#d97706'} style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, fontSize: 11, lineHeight: 15, color: isDark ? '#fbbf24' : '#d97706' }}>
                            US-only — both people need US accounts. For international surfers, use PayPal or a Payment link.
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {paymentChannels.length < MAX_PAYMENT_CHANNELS ? (
                  <Pressable
                    onPress={() => setPaymentChannels((prev) => [...prev, { type: 'paypal', handle: '' }])}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#0ea5e9" />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#0ea5e9' }}>Add payment method</Text>
                  </Pressable>
                ) : (
                  <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af' }}>
                    Up to {MAX_PAYMENT_CHANNELS} payment methods.
                  </Text>
                )}

                <View style={[s.switchRow, { marginTop: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151', marginBottom: 0 }]}>Accept donations</Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af', marginTop: 2 }}>
                      Reframes your payment block as “Buy Me a Coffee” for surfers who want to tip.
                    </Text>
                  </View>
                  <Switch
                    value={acceptsDonations}
                    onValueChange={setAcceptsDonations}
                    trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#0ea5e9' }}
                  />
                </View>
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Business-location map picker — tap the map to drop/move the pin,
          then confirm to commit lat/lon. */}
      <Modal
        visible={mapPickerVisible}
        animationType="slide"
        onRequestClose={() => setMapPickerVisible(false)}
      >
        {/* Plain View (not SafeAreaView) — react-native-safe-area-context
            doesn't resolve insets inside a RN Modal, so we pad the header with
            the insets captured from the parent provider instead. */}
        <View style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}>
          <View style={[s.mapPickerHeader, { paddingTop: insets.top + 12, borderBottomColor: isDark ? '#1f2937' : '#e5e7eb', borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Pressable onPress={() => setMapPickerVisible(false)} hitSlop={12}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? '#fff' : '#111827' }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#fff' : '#111827' }}>
              Business location
            </Text>
            <Pressable
              onPress={() => {
                if (pendingPin) {
                  setLat(pendingPin.latitude.toFixed(6));
                  setLon(pendingPin.longitude.toFixed(6));
                }
                setMapPickerVisible(false);
              }}
              disabled={!pendingPin}
              hitSlop={8}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: pendingPin ? '#0ea5e9' : (isDark ? '#374151' : '#d1d5db') }}>
                Done
              </Text>
            </Pressable>
          </View>
          <MapView
            // Remount on each open so initialRegion re-centers on the current
            // pin (RN Modal keeps children mounted, so without this the region
            // would only apply the first time the picker opens).
            key={mapPickerVisible ? 'map-open' : 'map-closed'}
            provider={PROVIDER_DEFAULT}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: pendingPin?.latitude ?? 20,
              longitude: pendingPin?.longitude ?? 0,
              latitudeDelta: pendingPin ? 0.05 : 80,
              longitudeDelta: pendingPin ? 0.05 : 80,
            } as Region}
            onPress={(e) => setPendingPin(e.nativeEvent.coordinate)}
          >
            {pendingPin && <Marker coordinate={pendingPin} />}
          </MapView>
          <View style={[s.mapPickerFooter, { backgroundColor: isDark ? '#000' : '#fff', paddingBottom: insets.bottom + 14 }]}>
            <Text style={{ fontSize: 13, color: isDark ? '#9ca3af' : '#6b7280', textAlign: 'center' }}>
              {pendingPin
                ? `Pinned at ${pendingPin.latitude.toFixed(5)}, ${pendingPin.longitude.toFixed(5)}`
                : 'Tap the map to drop your business pin (zoom in for accuracy).'}
            </Text>
          </View>
        </View>
      </Modal>
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
  segment: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3, gap: 3 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8 },
  segmentText: { fontSize: 14, fontWeight: '600' },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8,
    marginTop: 8,
  },
  mapPreviewWrap: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  mapPreviewBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(14,165,233,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  mapPreviewBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  mapPickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  mapPickerFooter: {
    paddingHorizontal: 16, paddingVertical: 14,
  },
});
