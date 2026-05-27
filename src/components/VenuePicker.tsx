import { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, StyleSheet, useColorScheme } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

type Coords = { lat: number | null; lon: number | null };

/**
 * Optional per-ad venue picker. Inline: a name field + a button summarizing the
 * pin. Tapping opens a full-screen map (a modal, NOT an inline MapView — an
 * inline map inside the form's ScrollView fights the scroll gesture) where the
 * advertiser taps to drop the pin. Coords feed place_lat/place_lon; the pin
 * renders on the mobile map near the ad's targeted breaks.
 */
export default function VenuePicker({
  lat,
  lon,
  name,
  onChange,
}: {
  lat: number | null;
  lon: number | null;
  name: string;
  onChange: (next: { lat: number | null; lon: number | null; name: string }) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Coords>({ lat, lon });

  const hasPin = Number.isFinite(lat) && Number.isFinite(lon);
  const draftHasPin = Number.isFinite(draft.lat) && Number.isFinite(draft.lon);

  const text = isDark ? '#fff' : '#111827';
  const muted = isDark ? '#9ca3af' : '#6b7280';
  const border = isDark ? 'rgba(148,163,184,0.25)' : '#e2e8f0';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc';

  // When the user taps a built-in map POI (a real business), we capture its
  // name so we can auto-fill the venue name on confirm. Reset each open.
  const [draftName, setDraftName] = useState<string | null>(null);

  const openSheet = () => { setDraft({ lat, lon }); setDraftName(null); setOpen(true); };
  const confirm = () => {
    onChange({ lat: draft.lat, lon: draft.lon, name: draftName ?? name });
    setOpen(false);
  };

  return (
    <View>
      <TextInput
        value={name}
        onChangeText={(t) => onChange({ lat, lon, name: t.slice(0, 120) })}
        placeholder="Venue name (e.g. Joe's Bar)"
        placeholderTextColor={muted}
        style={{ borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: text, backgroundColor: inputBg, marginBottom: 8 }}
      />
      <Pressable
        onPress={openSheet}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: inputBg }}
      >
        <Ionicons name="location-outline" size={18} color={hasPin ? '#0ea5e9' : muted} />
        <Text style={{ flex: 1, fontSize: 14, color: hasPin ? text : muted }}>
          {hasPin ? `Pinned · ${lat!.toFixed(4)}, ${lon!.toFixed(4)}` : 'Tap to set venue on map'}
        </Text>
        {hasPin && (
          <Pressable onPress={() => onChange({ lat: null, lon: null, name })} hitSlop={8}>
            <Text style={{ color: isDark ? '#38bdf8' : '#0284c7', fontSize: 12, fontWeight: '600' }}>Clear</Text>
          </Pressable>
        )}
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={{
              latitude: hasPin ? lat! : 20,
              longitude: hasPin ? lon! : -40,
              latitudeDelta: hasPin ? 0.05 : 80,
              longitudeDelta: hasPin ? 0.05 : 80,
            }}
            onPress={(e) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              setDraft({ lat: latitude, lon: longitude });
            }}
            onPoiClick={(e) => {
              // Tapping a labeled place (a real business) gives us its exact
              // coords + name — drop the pin there and auto-fill the venue name.
              const { coordinate, name: poiName } = e.nativeEvent;
              setDraft({ lat: coordinate.latitude, lon: coordinate.longitude });
              if (poiName) setDraftName(poiName);
            }}
          >
            {draftHasPin && <Marker coordinate={{ latitude: draft.lat!, longitude: draft.lon! }} pinColor="#0ea5e9" />}
          </MapView>

          <View style={[s.banner, { backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.92)' }]} pointerEvents="none">
            <Text style={{ color: text, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
              {draftName
                ? `Selected: ${draftName}`
                : draftHasPin
                  ? 'Tap again to move the pin, or tap a place'
                  : 'Tap a place, or anywhere on the map'}
            </Text>
          </View>

          <View style={[s.footer, { backgroundColor: isDark ? '#000' : '#fff', borderTopColor: border }]}>
            <Pressable onPress={() => setOpen(false)} style={[s.btn, { backgroundColor: inputBg }]}>
              <Text style={{ color: text, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={confirm} disabled={!draftHasPin} style={[s.btn, { backgroundColor: draftHasPin ? '#0ea5e9' : (isDark ? '#1f2937' : '#e5e7eb') }]}>
              <Text style={{ color: draftHasPin ? '#fff' : muted, fontWeight: '700' }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { position: 'absolute', top: 60, left: 16, right: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 32, borderTopWidth: StyleSheet.hairlineWidth },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12 },
});
