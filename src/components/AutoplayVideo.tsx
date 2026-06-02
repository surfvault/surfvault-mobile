import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';

/**
 * Autoplay clip for feed carousels.
 *
 * The player is kept ALIVE the whole time the slide is mounted and we just
 * toggle play/pause on `active`. This is what makes playback smooth: when a
 * slide scrolls into view the player is already buffered, so it starts
 * instantly with no spin-up stutter. (An earlier lazy variant that mounted the
 * player only while active fixed an Android-emulator ANR but made every active
 * slide reload from scratch — too janky on real devices, so it was reverted.)
 *
 * The poster sits underneath permanently and the VideoView fades to opacity 0
 * when inactive, so a paused slide shows the poster — not a frozen video frame
 * — with no remount flash.
 *
 * Two modes:
 * - `poster` provided  → poster renders underneath in all states.
 * - `poster` omitted   → "overlay" mode: nothing underneath, so the parent's
 *   own poster shows through when inactive (used by board cards).
 */
type Fit = 'cover' | 'contain';

export default function AutoplayVideo({
  uri,
  poster,
  active,
  style,
  contentFit = 'cover',
}: {
  uri: string;
  poster?: string;
  active: boolean;
  style: any;
  contentFit?: Fit;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <View style={style}>
      {poster ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit={contentFit} />
      ) : null}
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { opacity: active ? 1 : 0 }]}
        contentFit={contentFit}
        nativeControls={false}
        pointerEvents="none"
      />
    </View>
  );
}
