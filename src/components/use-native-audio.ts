import type * as ExpoAudio from "expo-audio";
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { Platform } from "react-native";
import type { WebView } from "react-native-webview";

import MediaChooser from "../../modules/naghshman-media-chooser";
import type { NativeAudioTrack } from "@/lib/native-bridge";

type Player = ExpoAudio.AudioPlayer;
type Status = ExpoAudio.AudioStatus;

export type NativeAudioCommand =
  | {
      type: "native-audio-load";
      track: NativeAudioTrack;
      position: number;
      autoplay: boolean;
    }
  | { type: "native-audio-play" }
  | { type: "native-audio-pause" }
  | { type: "native-audio-seek"; seconds: number }
  | { type: "native-audio-clear" };

// Often enough for a smooth progress bar, rarely enough for the bridge.
const STATUS_INTERVAL_MS = 500;
const SEEK_STEP_LOCK_SCREEN = { showSeekForward: true, showSeekBackward: true };

let audioModule: Promise<typeof ExpoAudio> | null = null;
// Loaded on first play: Expo Go and web previews may lack the native module.
function loadAudio() {
  audioModule ??= import("expo-audio");
  return audioModule;
}

/**
 * Plays the site's audio in the app instead of the WebView, the site's
 * `nativeAudioV1` protocol: the page sends native-audio-* commands and gets
 * `naghshman:native-audio-state` events back for its mini player. Android
 * shows the track in its media notification and lock screen, with the
 * publisher's avatar as the cover, and keeps playing in the background.
 */
export function useNativeAudio(webViewRef: RefObject<WebView | null>) {
  const player = useRef<Player | null>(null);
  const track = useRef<NativeAudioTrack | null>(null);
  const finished = useRef(false);
  const askedForNotifications = useRef(false);

  const report = useCallback(
    (status: Status | null, error?: string) => {
      const current = track.current;
      if (!current) return;
      const detail = {
        trackId: current.id,
        isPlaying: Boolean(status?.playing),
        isReady: Boolean(status?.isLoaded) && !status?.isBuffering,
        isBuffering: Boolean(status?.isBuffering),
        currentTime: status?.currentTime ?? 0,
        duration: status?.duration ?? 0,
        didJustFinish: Boolean(status?.didJustFinish),
        ...(error ? { error } : {}),
      };
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new CustomEvent('naghshman:native-audio-state', { detail: ${JSON.stringify(detail)} })); true;`,
      );
    },
    [webViewRef],
  );

  const ensurePlayer = useCallback(async () => {
    if (player.current) return player.current;
    const Audio = await loadAudio();
    await Audio.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      // The lock screen controls require exclusive audio focus.
      interruptionMode: "doNotMix",
    });
    const created = Audio.createAudioPlayer(null, {
      updateInterval: STATUS_INTERVAL_MS,
    });
    created.addListener("playbackStatusUpdate", (status) => {
      // didJustFinish arrives once; the site moves on to the next track.
      if (status.didJustFinish) finished.current = true;
      report(status);
    });
    player.current = created;
    return created;
  }, [report]);

  const handle = useCallback(
    async (command: NativeAudioCommand) => {
      if (Platform.OS === "web") return;
      try {
        if (command.type === "native-audio-load") {
          const audio = await ensurePlayer();
          const { track: next } = command;
          track.current = next;
          finished.current = false;
          // Uploads behind the site's session need its cookies.
          const cookie = MediaChooser?.cookiesFor(next.url);
          audio.replace({
            uri: next.url,
            ...(cookie ? { headers: { Cookie: cookie } } : {}),
          });
          if (command.position > 0) await audio.seekTo(command.position);
          const metadata = {
            title: next.title,
            artist: next.artist,
            albumTitle: "نقش من",
            artworkUrl: next.artwork,
          };
          audio.setActiveForLockScreen(true, metadata, SEEK_STEP_LOCK_SCREEN);
          if (command.autoplay) audio.play();
          report(audio.currentStatus);

          // Android 13+ hides the media notification without this permission.
          if (Platform.OS === "android" && !askedForNotifications.current) {
            askedForNotifications.current = true;
            const Audio = await loadAudio();
            void Audio.requestNotificationPermissionsAsync().catch(() => {});
          }
          return;
        }

        const audio = player.current;
        if (!audio) return;
        switch (command.type) {
          case "native-audio-play":
            // Play after the end starts the track over, like the web player.
            if (finished.current) {
              finished.current = false;
              await audio.seekTo(0);
            }
            audio.play();
            break;
          case "native-audio-pause":
            audio.pause();
            break;
          case "native-audio-seek":
            finished.current = false;
            await audio.seekTo(command.seconds);
            break;
          case "native-audio-clear":
            audio.pause();
            audio.clearLockScreenControls();
            track.current = null;
            return;
        }
        report(audio.currentStatus);
      } catch (error) {
        report(
          player.current?.currentStatus ?? null,
          String(error) || "playback failed",
        );
      }
    },
    [ensurePlayer, report],
  );

  /**
   * A full page load starts the site's audio state from nothing, so the app
   * stops what it was playing instead of leaving it without a mini player.
   */
  const resetForNewDocument = useCallback(() => {
    const audio = player.current;
    if (!audio || !track.current) return;
    audio.pause();
    audio.clearLockScreenControls();
    track.current = null;
  }, []);

  useEffect(
    () => () => {
      player.current?.remove();
      player.current = null;
    },
    [],
  );

  return useMemo(
    () => ({ handle, resetForNewDocument }),
    [handle, resetForNewDocument],
  );
}
