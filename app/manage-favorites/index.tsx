import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Stack } from 'expo-router';
import { useSmartBack } from '../../src/context/NavigationContext';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import {
  useGetUserFavoritesQuery,
  useUpdateUserFavoritesMutation,
} from '../../src/store';
import { useAuth } from '../../src/context/AuthProvider';
import ActionSheet from '../../src/components/ActionSheet';

export default function ManageFavoritesScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const goBack = useSmartBack();
  const { isAuthenticated } = useAuth();

  const { data: favoritesData } = useGetUserFavoritesQuery({} as any, { skip: !isAuthenticated });
  const [updateFavorite] = useUpdateUserFavoritesMutation();
  const favorites = favoritesData?.results?.favorites ?? [];

  // Local ordering state for optimistic updates
  const [favoritesInOrder, setFavoritesInOrder] = useState<any[]>([]);
  const [removeTarget, setRemoveTarget] = useState<any | null>(null);

  useEffect(() => {
    if (!favorites || favorites.length === 0) {
      setFavoritesInOrder([]);
      return;
    }
    setFavoritesInOrder((prev) => {
      if (!prev || prev.length === 0) return favorites;
      const prevSet = new Set(prev.map((f: any) => String(f.surf_break_id)));
      const sameItems = favorites.every((f: any) => prevSet.has(String(f.surf_break_id)));
      if (sameItems && favorites.length === prev.length) return prev;
      return favorites;
    });
  }, [favorites]);

  const handleDragEnd = useCallback(
    async ({ data, from, to }: { data: any[]; from: number; to: number }) => {
      if (from === to) return;
      setFavoritesInOrder(data);
      const movedItem = data[to];
      await updateFavorite({
        surfBreakId: movedItem.surf_break_id,
        action: 'favorite-reorder',
        newIndex: to,
      });
    },
    [updateFavorite]
  );

  const handleRemove = useCallback((item: any) => {
    setRemoveTarget(item);
  }, []);

  const doRemove = useCallback(async () => {
    if (!removeTarget) return;
    setFavoritesInOrder((prev) => prev.filter((f) => f.surf_break_id !== removeTarget.surf_break_id));
    await updateFavorite({
      surfBreakId: removeTarget.surf_break_id,
      action: 'unfavorite',
    });
  }, [removeTarget, updateFavorite]);

  const removeBreakName = removeTarget
    ? (removeTarget.surf_break_identifier ?? '').replaceAll('_', ' ')
    : '';

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<any>) => {
      const breakName = (item.surf_break_identifier ?? '').replaceAll('_', ' ');
      const region = (item.region ?? '').replaceAll('_', ' ');
      return (
        <ScaleDecorator>
          <View
            style={[
              s.row,
              { backgroundColor: isDark ? '#030712' : '#fff' },
              { borderBottomColor: isDark ? '#1f2937' : '#f3f4f6' },
              isActive && {
                backgroundColor: isDark ? '#1f2937' : '#f0f9ff',
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 4,
              },
            ]}
          >
            {/* Drag handle */}
            <Pressable onPressIn={drag} hitSlop={8} style={s.dragHandle}>
              <Ionicons name="reorder-three" size={22} color={isDark ? '#6b7280' : '#9ca3af'} />
            </Pressable>

            {/* Location info */}
            <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} style={{ marginLeft: 4 }} />
            <View style={s.rowContent}>
              <View style={s.nameRow}>
                <Text style={[s.name, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                  {breakName}
                </Text>
                {item.hasActivePhotographer && (
                  <View style={s.activeBadge}>
                    <View style={s.activeDot} />
                    <Text style={s.activeText}>Active</Text>
                  </View>
                )}
              </View>
              <Text style={[s.subtitle, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
                {item.country_code}{region ? ` · ${region}` : ''}
              </Text>
            </View>

            {/* Remove button */}
            <Pressable onPress={() => handleRemove(item)} hitSlop={8} style={s.removeBtn}>
              <Ionicons name="close-circle" size={22} color={isDark ? '#6b7280' : '#d1d5db'} />
            </Pressable>
          </View>
        </ScaleDecorator>
      );
    },
    [isDark, handleRemove]
  );

  return (
    <View style={[s.container, { backgroundColor: isDark ? '#030712' : '#fff' }]}>
      <Stack.Screen
        options={{
          title: 'Manage Favorites',
          headerStyle: { backgroundColor: isDark ? '#030712' : '#fff' },
          headerTintColor: isDark ? '#fff' : '#111827',
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={goBack} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={isDark ? '#fff' : '#111827'} />
            </Pressable>
          ),
        }}
      />

      {favoritesInOrder.length > 0 && (
        <Text style={[s.hint, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
          Hold and drag to reorder
        </Text>
      )}

      <DraggableFlatList
        data={favoritesInOrder}
        keyExtractor={(item: any) => String(item.surf_break_id)}
        onDragEnd={handleDragEnd}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="heart-outline" size={48} color={isDark ? '#374151' : '#d1d5db'} />
            <Text style={[s.emptyText, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
              No favorites yet
            </Text>
            <Text style={[s.emptySubtext, { color: isDark ? '#4b5563' : '#d1d5db' }]}>
              Favorite surf breaks to see them here
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={favoritesInOrder.length === 0 ? { flex: 1 } : undefined}
      />

      <ActionSheet
        visible={!!removeTarget}
        title={`Remove ${removeBreakName}?`}
        options={[{
          label: 'Remove',
          icon: 'trash-outline',
          destructive: true,
          onPress: doRemove,
        }]}
        onClose={() => setRemoveTarget(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dragHandle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    marginLeft: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  activeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ef4444',
  },
  removeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
  },
});
