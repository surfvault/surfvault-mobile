import { useState, useCallback, useRef } from 'react';
import { View, TextInput, Pressable, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
  placeholder?: string;
  onSearch: (term: string) => void;
  debounceMs?: number;
}

export default function SearchBar({
  placeholder = 'Search...',
  onSearch,
  debounceMs = 350,
}: SearchBarProps) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleChange = useCallback(
    (text: string) => {
      setValue(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSearch(text);
      }, debounceMs);
    },
    [onSearch, debounceMs]
  );

  const handleClear = useCallback(() => {
    setValue('');
    onSearch('');
  }, [onSearch]);

  return (
    <View className="flex-row items-center bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2.5">
      <Ionicons
        name="search-outline"
        size={18}
        color={isDark ? '#6b7280' : '#9ca3af'}
      />
      <TextInput
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
        autoCapitalize="none"
        autoCorrect={false}
        className="flex-1 ml-2 text-base text-gray-900 dark:text-white"
      />
      {value.length > 0 && (
        <Pressable onPress={handleClear} hitSlop={8}>
          <Ionicons
            name="close-circle"
            size={18}
            color={isDark ? '#6b7280' : '#9ca3af'}
          />
        </Pressable>
      )}
    </View>
  );
}
