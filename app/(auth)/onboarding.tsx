import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useDoesHandleExistQuery, useUpdateUserHandleMutation, useUpdateUserTypeMutation } from '../../src/store';

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'handle' | 'type'>('handle');
  const [handle, setHandle] = useState('');
  const [handleError, setHandleError] = useState('');

  const { data: handleCheck, isFetching: checkingHandle } = useDoesHandleExistQuery(
    { handle },
    { skip: handle.length < 3 }
  );

  const [updateHandle, { isLoading: updatingHandle }] = useUpdateUserHandleMutation();
  const [updateType, { isLoading: updatingType }] = useUpdateUserTypeMutation();

  const handleExists = handleCheck?.results?.exists;
  const isHandleValid = handle.length >= 3 && /^[a-zA-Z0-9._-]+$/.test(handle);

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

  const onSelectType = useCallback(
    async (type: string) => {
      try {
        await updateType({ type, isPublic: true }).unwrap();
        router.replace('/(tabs)');
      } catch {
        // Handle error
      }
    },
    [updateType, router]
  );

  if (step === 'handle') {
    return (
      <View className="flex-1 bg-white dark:bg-gray-950 px-8 pt-24">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Choose your handle
        </Text>
        <Text className="text-base text-gray-500 dark:text-gray-400 mb-8">
          This is how others will find you on SurfVault
        </Text>

        <View className="flex-row items-center bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 mb-2">
          <Text className="text-gray-400 text-lg mr-1">@</Text>
          <TextInput
            value={handle}
            onChangeText={(text) => {
              setHandle(text.toLowerCase());
              setHandleError('');
            }}
            placeholder="your-handle"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-lg text-gray-900 dark:text-white"
          />
          {checkingHandle && <ActivityIndicator size="small" />}
        </View>

        {handleError ? (
          <Text className="text-red-500 text-sm mb-4">{handleError}</Text>
        ) : handle.length >= 3 && !checkingHandle ? (
          <Text className={`text-sm mb-4 ${handleExists ? 'text-red-500' : 'text-green-500'}`}>
            {handleExists ? 'Handle already taken' : 'Handle available'}
          </Text>
        ) : (
          <View className="mb-4" />
        )}

        <Pressable
          onPress={onSubmitHandle}
          disabled={!isHandleValid || handleExists || updatingHandle}
          className={`rounded-xl py-4 items-center ${
            isHandleValid && !handleExists
              ? 'bg-sky-500 active:bg-sky-600'
              : 'bg-gray-300 dark:bg-gray-700'
          }`}
        >
          <Text className="text-white text-lg font-semibold">
            {updatingHandle ? 'Setting up...' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-gray-950 px-8 pt-24">
      <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        How will you use SurfVault?
      </Text>
      <Text className="text-base text-gray-500 dark:text-gray-400 mb-8">
        You can change this later in settings
      </Text>

      <Pressable
        onPress={() => onSelectType('photographer')}
        disabled={updatingType}
        className="bg-gray-100 dark:bg-gray-800 rounded-xl p-6 mb-4 active:bg-gray-200 dark:active:bg-gray-700"
      >
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Photographer
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          I shoot surf photos and want to share them
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onSelectType('surfer')}
        disabled={updatingType}
        className="bg-gray-100 dark:bg-gray-800 rounded-xl p-6 active:bg-gray-200 dark:active:bg-gray-700"
      >
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Surfer
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          I want to find photos of myself surfing
        </Text>
      </Pressable>
    </View>
  );
}
