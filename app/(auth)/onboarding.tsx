import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
let ImageManipulator: any = null;
try { ImageManipulator = require('expo-image-manipulator'); } catch {}
import {
  useDoesHandleExistQuery,
  useUpdateUserHandleMutation,
  useUpdateUserTypeMutation,
  useUpdateUserMetaDataMutation,
} from '../../src/store';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';

type Step = 'handle' | 'type' | 'picture';

export default function OnboardingScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user } = useUser();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 16;

  // Determine starting step from what's already completed. If the user
  // arrives mid-flow (e.g. already chose a handle on web), resume from
  // the first incomplete step instead of forcing them through again.
  const [step, setStep] = useState<Step>(() => {
    if (!user?.handle_changed) return 'handle';
    if (!user?.user_type) return 'type';
    return 'picture';
  });

  // If user lands here already fully onboarded (e.g. web user who completed
  // both steps), redirect on mount only — not on every user state change.
  // This avoids ejecting mid-flow when step 2 sets user_type.
  const initiallyOnboarded = useRef(!!user?.handle_changed && !!user?.user_type);
  useEffect(() => {
    if (initiallyOnboarded.current) {
      router.replace('/(tabs)');
    }
  }, []);

  // Handle step
  const [handle, setHandle] = useState('');
  const [handleError, setHandleError] = useState('');

  // Type step
  const [userType, setUserType] = useState<'surfer' | 'photographer' | null>(null);
  const [isPublic, setIsPublic] = useState(true);

  // Picture step
  const [profilePicUri, setProfilePicUri] = useState<string | null>(null);
  const [profilePicFile, setProfilePicFile] = useState<any>(null);
  const [savingPicture, setSavingPicture] = useState(false);

  const { data: handleCheck, isFetching: checkingHandle } = useDoesHandleExistQuery(
    { handle },
    { skip: handle.length < 3 }
  );

  const [updateHandle, { isLoading: updatingHandle }] = useUpdateUserHandleMutation();
  const [updateType, { isLoading: updatingType }] = useUpdateUserTypeMutation();
  const [updateMeta] = useUpdateUserMetaDataMutation();

  // API returns { results: { success: true } } when handle is AVAILABLE
  // and { results: { success: false } } when handle is already taken.
  const handleExists = handleCheck?.results?.success === false;
  const isHandleValid = handle.length >= 3 && /^[a-zA-Z0-9._-]+$/.test(handle);

  // --- Handle step ---
  const onSubmitHandle = useCallback(async () => {
    if (!isHandleValid || handleExists) {
      setHandleError(handleExists ? 'Handle already taken' : 'Invalid handle');
      return;
    }
    try {
      await updateHandle({ handle }).unwrap();
      setStep('type');
    } catch {
      setHandleError('Failed to set handle');
    }
  }, [handle, isHandleValid, handleExists, updateHandle]);

  // --- Type step ---
  const onSubmitType = useCallback(async () => {
    if (!userType) return;
    try {
      await updateType({ type: userType, isPublic }).unwrap();
      setStep('picture');
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  }, [userType, isPublic, updateType]);

  // --- Picture step ---
  const handlePickPicture = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
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

  const finishOnboarding = useCallback(async () => {
    if (profilePicFile) {
      setSavingPicture(true);
      try {
        const result: any = await updateMeta({ metaData: { picture: 'updating' } }).unwrap();
        const presignedUrl = result?.results?.profilePicPresignedUrl;
        if (presignedUrl) {
          const response = await fetch(profilePicFile.uri);
          const blob = await response.blob();
          await fetch(presignedUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': 'image/jpeg' },
          });
        }
      } catch {
        Alert.alert('Error', 'Failed to upload photo. You can add one later from Edit Profile.');
      } finally {
        setSavingPicture(false);
      }
    }
    router.replace('/(tabs)');
  }, [profilePicFile, updateMeta, router]);

  // -----------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------

  const bg = isDark ? '#030712' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#111827';
  const mutedColor = isDark ? '#9ca3af' : '#6b7280';
  const inputBg = isDark ? '#1f2937' : '#f3f4f6';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc';
  const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';

  const firstName = (user?.name ?? '').split(' ')[0];

  if (step === 'handle') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: bg }]} edges={['top']}>
        <View style={[s.content, { paddingBottom: bottomPad }]}>
          <StepIndicator current={1} total={3} isDark={isDark} />
          <Text style={[s.welcome, { color: textColor }]}>
            Welcome to SurfVault{firstName ? `, ${firstName}` : ''}!
          </Text>
          <Text style={[s.title, { color: textColor }]}>Choose your handle</Text>
          <Text style={[s.subtitle, { color: mutedColor }]}>
            This is how the surf community will find you. You can change it anytime.
          </Text>

          <View style={[s.handleInputWrap, { backgroundColor: inputBg }]}>
            <Text style={[s.atSign, { color: mutedColor }]}>@</Text>
            <TextInput
              value={handle}
              onChangeText={(text) => {
                setHandle(text.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                setHandleError('');
              }}
              placeholder="your-handle"
              placeholderTextColor={mutedColor}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              style={[s.handleInput, { color: textColor }]}
            />
            {checkingHandle && <ActivityIndicator size="small" color="#0ea5e9" />}
          </View>

          {handleError ? (
            <Text style={s.errorText}>{handleError}</Text>
          ) : handle.length >= 3 && !checkingHandle ? (
            <Text style={handleExists ? s.errorText : s.successText}>
              {handleExists ? 'Handle already taken' : 'Handle available'}
            </Text>
          ) : (
            <Text style={[s.hintText, { color: mutedColor }]}>
              Letters, numbers, periods, dashes, and underscores
            </Text>
          )}

          <Pressable
            onPress={onSubmitHandle}
            disabled={!isHandleValid || handleExists || updatingHandle}
            style={[
              s.primaryButton,
              (!isHandleValid || handleExists) && s.primaryButtonDisabled,
            ]}
          >
            <Text style={s.primaryButtonText}>
              {updatingHandle ? 'Setting up...' : 'Continue'}
            </Text>
          </Pressable>

          <Pressable onPress={logout} style={s.signOutLink}>
            <Text style={[s.signOutText, { color: mutedColor }]}>
              Sign in with a different account
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'type') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: bg }]} edges={['top']}>
        <View style={[s.content, { paddingBottom: bottomPad }]}>
          <StepIndicator current={2} total={3} isDark={isDark} />
          <Text style={[s.title, { color: textColor }]}>How will you use SurfVault?</Text>
          <Text style={[s.subtitle, { color: mutedColor }]}>You can change this later in settings</Text>

          <Pressable
            onPress={() => setUserType('surfer')}
            style={[
              s.optionCard,
              { backgroundColor: cardBg, borderColor: userType === 'surfer' ? '#0ea5e9' : cardBorder },
              userType === 'surfer' && s.optionCardSelected,
            ]}
          >
            <View style={s.optionRow}>
              <View style={[s.optionIconWrap, { backgroundColor: userType === 'surfer' ? '#e0f2fe' : (isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9') }]}>
                <MaterialCommunityIcons name="surfing" size={24} color={userType === 'surfer' ? '#0ea5e9' : mutedColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.optionTitle, { color: textColor }]}>Surfer</Text>
                <Text style={[s.optionDescription, { color: mutedColor }]}>
                  Track my surf journey and find photos of myself
                </Text>
              </View>
              {userType === 'surfer' && <Ionicons name="checkmark-circle" size={22} color="#0ea5e9" />}
            </View>
          </Pressable>

          <Pressable
            onPress={() => setUserType('photographer')}
            style={[
              s.optionCard,
              { backgroundColor: cardBg, borderColor: userType === 'photographer' ? '#0ea5e9' : cardBorder },
              userType === 'photographer' && s.optionCardSelected,
            ]}
          >
            <View style={s.optionRow}>
              <View style={[s.optionIconWrap, { backgroundColor: userType === 'photographer' ? '#e0f2fe' : (isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9') }]}>
                <Ionicons name="camera-outline" size={24} color={userType === 'photographer' ? '#0ea5e9' : mutedColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.optionTitle, { color: textColor }]}>Photographer</Text>
                <Text style={[s.optionDescription, { color: mutedColor }]}>
                  Upload and share my surf session photos
                </Text>
              </View>
              {userType === 'photographer' && <Ionicons name="checkmark-circle" size={22} color="#0ea5e9" />}
            </View>
          </Pressable>

          <Text style={[s.sectionLabel, { color: textColor, marginTop: 24 }]}>Profile visibility</Text>

          <View style={s.toggleRow}>
            <Pressable
              onPress={() => setIsPublic(true)}
              style={[
                s.toggleBtn,
                {
                  backgroundColor: isPublic ? '#0ea5e9' : inputBg,
                },
              ]}
            >
              <View style={s.toggleInner}>
                <Ionicons name="globe-outline" size={16} color={isPublic ? '#fff' : mutedColor} />
                <Text style={[s.toggleText, { color: isPublic ? '#fff' : textColor }]}>Public</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setIsPublic(false)}
              style={[
                s.toggleBtn,
                {
                  backgroundColor: !isPublic ? '#0ea5e9' : inputBg,
                },
              ]}
            >
              <View style={s.toggleInner}>
                <Ionicons name="lock-closed-outline" size={16} color={!isPublic ? '#fff' : mutedColor} />
                <Text style={[s.toggleText, { color: !isPublic ? '#fff' : textColor }]}>Private</Text>
              </View>
            </Pressable>
          </View>

          <Text style={[s.hintText, { color: mutedColor, marginTop: 8 }]}>
            {isPublic
              ? 'Your sessions will be visible to everyone. You can still hide the location of individual sessions if you wish.'
              : 'Your profile is still discoverable, but users must request access to view your sessions and photos.'}
          </Text>

          <View style={s.spacer} />

          <Pressable
            onPress={onSubmitType}
            disabled={!userType || updatingType}
            style={[s.primaryButton, !userType && s.primaryButtonDisabled]}
          >
            <Text style={s.primaryButtonText}>
              {updatingType ? 'Saving...' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Picture step
  return (
    <SafeAreaView style={[s.container, { backgroundColor: bg }]} edges={['top']}>
      <View style={[s.content, { paddingBottom: bottomPad }]}>
        <StepIndicator current={3} total={3} isDark={isDark} />
        <Text style={[s.title, { color: textColor }]}>Add a profile picture</Text>
        <Text style={[s.subtitle, { color: mutedColor }]}>
          Optional — you can add one later from Edit Profile
        </Text>

        <Pressable
          onPress={handlePickPicture}
          style={[s.picPickerWrap, { backgroundColor: cardBg, borderColor: cardBorder }]}
        >
          {profilePicUri ? (
            <Image source={{ uri: profilePicUri }} style={s.picImage} contentFit="cover" />
          ) : (
            <View style={s.picPlaceholder}>
              <Ionicons name="camera" size={42} color={mutedColor} />
              <Text style={[s.picPlaceholderText, { color: mutedColor }]}>Tap to choose a photo</Text>
            </View>
          )}
        </Pressable>

        <View style={s.spacer} />

        <Pressable
          onPress={finishOnboarding}
          disabled={savingPicture}
          style={s.primaryButton}
        >
          <Text style={s.primaryButtonText}>
            {savingPicture ? 'Uploading...' : profilePicUri ? 'Finish' : 'Skip for now'}
          </Text>
        </Pressable>

        {profilePicUri && !savingPicture && (
          <Pressable onPress={handlePickPicture} style={s.secondaryButton}>
            <Text style={[s.secondaryButtonText, { color: mutedColor }]}>Choose a different photo</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function StepIndicator({ current, total, isDark }: { current: number; total: number; isDark: boolean }) {
  return (
    <View style={s.stepIndicator}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            s.stepDot,
            {
              backgroundColor:
                i + 1 <= current ? '#0ea5e9' : isDark ? '#1f2937' : '#e5e7eb',
              width: i + 1 === current ? 20 : 6,
            },
          ]}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  stepIndicator: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 28,
  },
  stepDot: {
    height: 6,
    borderRadius: 3,
  },
  welcome: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.6,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 28,
    lineHeight: 22,
  },
  handleInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  atSign: { fontSize: 17, marginRight: 4 },
  handleInput: { flex: 1, fontSize: 17, paddingVertical: 0 },
  errorText: { color: '#ef4444', fontSize: 13, marginBottom: 16 },
  successText: { color: '#10b981', fontSize: 13, marginBottom: 16 },
  hintText: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  primaryButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 'auto',
  },
  primaryButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  optionCard: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  optionCardSelected: {
    // color handled via borderColor in inline style
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  optionDescription: { fontSize: 13, lineHeight: 18 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  toggleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleText: { fontSize: 15, fontWeight: '600' },
  picPickerWrap: {
    alignSelf: 'center',
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  picImage: { width: '100%', height: '100%' },
  picPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  picPlaceholderText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
  spacer: { flex: 1 },
  signOutLink: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
