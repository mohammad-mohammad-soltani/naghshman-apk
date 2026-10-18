import type * as MediaLibraryModule from "expo-media-library/legacy";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import MediaChooser, {
  type PickedMedia,
} from "../../modules/naghshman-media-chooser";
import {
  formatDuration,
  MAX_MEDIA_SELECTION,
  parseMediaRequest,
  persianDigits,
  toggleSelection,
  type MediaRequest,
} from "@/lib/media-chooser-request";

type Asset = MediaLibraryModule.Asset;
type GalleryAccess = "checking" | "all" | "limited" | "denied";
type Tile =
  | { kind: "camera"; video: boolean; key: string }
  | { kind: "asset"; asset: Asset; key: string };

const COLUMNS = 3;
const GAP = 2;
const PAGE_SIZE = 60;
const SHEET_RATIO = 0.72;

const BRAND = "#dc2626";
const PALETTE = {
  light: {
    sheet: "#ffffff",
    text: "#101010",
    muted: "#6b6b73",
    tile: "#f1f1f4",
    border: "#e8e8ec",
    grabber: "#d4d4d8",
  },
  dark: {
    sheet: "#1c1c1e",
    text: "#f5f5f7",
    muted: "#a1a1aa",
    tile: "#2c2c2e",
    border: "#333333",
    grabber: "#3f3f46",
  },
};

let mediaLibrary: Promise<typeof MediaLibraryModule> | null = null;
// Expo Go lacks the full media-library module; load it only when the sheet opens.
function loadMediaLibrary() {
  mediaLibrary ??= import("expo-media-library/legacy");
  return mediaLibrary;
}

function galleryTypes(request: MediaRequest): ("photo" | "video")[] {
  return [
    ...(request.images ? (["photo"] as const) : []),
    ...(request.videos ? (["video"] as const) : []),
  ];
}

async function readGalleryAccess(
  request: MediaRequest,
  ask: boolean,
): Promise<{ access: GalleryAccess; canAskAgain: boolean }> {
  const MediaLibrary = await loadMediaLibrary();
  const types = galleryTypes(request);
  const response = ask
    ? await MediaLibrary.requestPermissionsAsync(false, types)
    : await MediaLibrary.getPermissionsAsync(false, types);
  if (response.status !== "granted") {
    return { access: "denied", canAskAgain: response.canAskAgain };
  }
  return {
    access: response.accessPrivileges === "limited" ? "limited" : "all",
    canAskAgain: response.canAskAgain,
  };
}

/** Takes a photo or video in the system camera; null when the user backs out. */
async function capture(video: boolean): Promise<PickedMedia | null | "denied"> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return "denied";
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: video ? ["videos"] : ["images"],
    quality: 0.9,
  });
  const uri = result.canceled ? null : result.assets[0]?.uri;
  return uri ? { uri, video } : null;
}

/**
 * Answers the page's photo/video <input type="file"> with an in-app sheet in
 * the style of Telegram: recent gallery items, camera tiles and a way out to
 * the system's Files chooser. Mounted only where the native module exists.
 */
export function MediaPickerHost({
  theme,
  onNotice,
}: {
  theme: "light" | "dark";
  onNotice: (message: string) => void;
}) {
  const [request, setRequest] = useState<MediaRequest | null>(null);
  const answered = useRef(true);

  const answer = useCallback((items: PickedMedia[] | null) => {
    if (answered.current) return;
    answered.current = true;
    setRequest(null);
    if (items?.length) MediaChooser?.resolve(items);
    else MediaChooser?.cancel();
  }, []);

  const openCamera = useCallback(
    async (video: boolean) => {
      const picked = await capture(video);
      if (picked === "denied") {
        onNotice("برای گرفتن عکس و فیلم، اجازهٔ دسترسی به دوربین لازم است.");
        return false;
      }
      if (!picked) return false;
      answer([picked]);
      return true;
    },
    [answer, onNotice],
  );

  // The subscription outlives re-renders: re-subscribing would cancel the
  // request that is open right now.
  const openCameraRef = useRef(openCamera);
  useEffect(() => {
    openCameraRef.current = openCamera;
  }, [openCamera]);

  useEffect(() => {
    if (!MediaChooser) return;
    const subscription = MediaChooser.addListener("onMediaRequest", (event) => {
      const next = parseMediaRequest(event);
      if (!next) {
        MediaChooser?.cancel();
        return;
      }
      answered.current = false;
      if (next.capture) {
        // <input capture> asks for the camera directly, like the browser does.
        void openCameraRef.current(!next.images).then((sent) => {
          if (!sent) answer(null);
        });
        return;
      }
      setRequest(next);
    });
    return () => {
      subscription.remove();
      answer(null);
    };
  }, [answer]);

  if (!request || request.capture) return null;
  return (
    <MediaPickerSheet
      key={JSON.stringify(request)}
      request={request}
      theme={theme}
      onSend={(items) => answer(items)}
      onCancel={() => answer(null)}
      onCamera={(video) => void openCamera(video)}
      onFiles={() => {
        if (answered.current) return;
        answered.current = true;
        setRequest(null);
        MediaChooser?.openSystemChooser();
      }}
    />
  );
}

function MediaPickerSheet({
  request,
  theme,
  onSend,
  onCancel,
  onCamera,
  onFiles,
}: {
  request: MediaRequest;
  theme: "light" | "dark";
  onSend: (items: PickedMedia[]) => void;
  onCancel: () => void;
  onCamera: (video: boolean) => void;
  onFiles: () => void;
}) {
  const colors = PALETTE[theme];
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const sheetHeight = Math.round(height * SHEET_RATIO);
  const cell = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const [access, setAccess] = useState<GalleryAccess>("checking");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const cursor = useRef<{ endCursor?: string; hasNextPage: boolean }>({
    hasNextPage: true,
  });
  const loading = useRef(false);

  const [translate] = useState(() => new Animated.Value(sheetHeight));
  const [backdrop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translate, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdrop, translate]);

  /**
   * Slides the sheet away before answering, so it never just vanishes. A
   * second tap mid-animation is harmless: the host answers a request once.
   */
  const close = useCallback(
    (then: () => void) => {
      Animated.parallel([
        Animated.timing(translate, {
          toValue: sheetHeight,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => then());
    },
    [backdrop, sheetHeight, translate],
  );

  const dismiss = useCallback(() => close(onCancel), [close, onCancel]);

  const drag = useMemo(
    () =>
      PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) =>
        translate.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > sheetHeight * 0.25 || gesture.vy > 1.1) {
          dismiss();
        } else {
          Animated.spring(translate, {
            toValue: 0,
            bounciness: 4,
            useNativeDriver: true,
          }).start();
        }
      },
      }),
    [dismiss, sheetHeight, translate],
  );

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (loading.current) return;
      if (!reset && !cursor.current.hasNextPage) return;
      loading.current = true;
      try {
        const MediaLibrary = await loadMediaLibrary();
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          after: reset ? undefined : cursor.current.endCursor,
          mediaType: galleryTypes(request),
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        cursor.current = {
          endCursor: page.endCursor,
          hasNextPage: page.hasNextPage,
        };
        setAssets((current) =>
          reset ? page.assets : [...current, ...page.assets],
        );
        setExhausted(!page.hasNextPage);
      } catch {
        cursor.current = { hasNextPage: false };
        setExhausted(true);
      } finally {
        loading.current = false;
      }
    },
    [request],
  );

  const applyAccess = useCallback(
    (result: { access: GalleryAccess; canAskAgain: boolean }) => {
      setAccess(result.access);
      setCanAskAgain(result.canAskAgain);
      if (result.access !== "denied") void loadPage(true);
    },
    [loadPage],
  );

  const refreshAccess = useCallback(
    (ask: boolean) =>
      readGalleryAccess(request, ask).then(applyAccess, () =>
        setAccess("denied"),
      ),
    [applyAccess, request],
  );

  useEffect(() => {
    readGalleryAccess(request, true).then(applyAccess, () =>
      setAccess("denied"),
    );
  }, [applyAccess, request]);

  // Coming back from Settings (or the Android 14 selection screen) may have
  // changed which photos the app can see.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshAccess(false);
    });
    return () => subscription.remove();
  }, [refreshAccess]);

  const allowAccess = async () => {
    if (!canAskAgain) {
      void Linking.openSettings();
      return;
    }
    await refreshAccess(true);
  };

  const selectMore = async () => {
    try {
      const MediaLibrary = await loadMediaLibrary();
      await MediaLibrary.presentPermissionsPickerAsync(galleryTypes(request));
    } finally {
      await refreshAccess(false);
    }
  };

  const toPicked = (asset: Asset): PickedMedia => ({
    id: asset.id,
    video: asset.mediaType === "video",
  });

  const tapAsset = (asset: Asset) => {
    if (!request.multiple) {
      close(() => onSend([toPicked(asset)]));
      return;
    }
    setSelected((current) => toggleSelection(current, asset.id));
  };

  const send = () => {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const items = selected
      .map((id) => byId.get(id))
      .filter((asset): asset is Asset => Boolean(asset))
      .map(toPicked);
    close(() => onSend(items));
  };

  const tiles: Tile[] = [
    ...(request.images
      ? [{ kind: "camera" as const, video: false, key: "camera-photo" }]
      : []),
    ...(request.videos
      ? [{ kind: "camera" as const, video: true, key: "camera-video" }]
      : []),
    ...assets.map((asset) => ({
      kind: "asset" as const,
      asset,
      key: asset.id,
    })),
  ];

  const renderTile = ({ item, index }: { item: Tile; index: number }) => {
    const style = {
      width: cell,
      height: cell,
      marginLeft: index % COLUMNS === COLUMNS - 1 ? 0 : GAP,
      marginBottom: GAP,
      backgroundColor: colors.tile,
    };

    if (item.kind === "camera") {
      return (
        <Pressable
          style={({ pressed }) => [
            style,
            styles.cameraTile,
            pressed && styles.pressed,
          ]}
          onPress={() => onCamera(item.video)}
          accessibilityRole="button"
          accessibilityLabel={item.video ? "ضبط فیلم" : "گرفتن عکس"}
        >
          {item.video ? (
            <VideoIcon color={colors.text} />
          ) : (
            <CameraIcon color={colors.text} />
          )}
          <Text style={[styles.cameraLabel, { color: colors.text }]}>
            {item.video ? "فیلم" : "دوربین"}
          </Text>
        </Pressable>
      );
    }

    const { asset } = item;
    const order = selected.indexOf(asset.id);
    const isSelected = order >= 0;
    return (
      <Pressable
        style={style}
        onPress={() => tapAsset(asset)}
        accessibilityRole="imagebutton"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={asset.mediaType === "video" ? "ویدیو" : "عکس"}
      >
        <Image
          source={{ uri: asset.uri, width: cell, height: cell }}
          resizeMethod="resize"
          fadeDuration={0}
          style={[StyleSheet.absoluteFill, isSelected && styles.dimmed]}
        />
        {asset.mediaType === "video" && (
          <View style={styles.duration}>
            <Text style={styles.durationText}>
              {formatDuration(asset.duration)}
            </Text>
          </View>
        )}
        {request.multiple && (
          <View
            style={[
              styles.check,
              isSelected ? styles.checkOn : styles.checkOff,
            ]}
          >
            {isSelected && (
              <Text style={styles.checkText}>{persianDigits(order + 1)}</Text>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  const title =
    request.images && request.videos
      ? "عکس و ویدیو"
      : request.videos
        ? "ویدیو"
        : "عکس";

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityLabel="بستن"
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight + insets.bottom,
            backgroundColor: colors.sheet,
            transform: [{ translateY: translate }],
          },
        ]}
      >
        <View {...drag.panHandlers}>
          <View style={[styles.grabber, { backgroundColor: colors.grabber }]} />
          <View style={styles.header}>
            <Pressable
              hitSlop={10}
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel="بستن"
            >
              <CloseIcon color={colors.text} />
            </Pressable>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Pressable
              hitSlop={10}
              style={({ pressed }) => [
                styles.files,
                { borderColor: colors.border },
                pressed && styles.pressed,
              ]}
              onPress={() => close(onFiles)}
              accessibilityRole="button"
            >
              <FolderIcon color={colors.text} />
              <Text style={[styles.filesText, { color: colors.text }]}>
                فایل‌ها
              </Text>
            </Pressable>
          </View>
        </View>

        {access === "limited" && (
          <Pressable
            style={[styles.banner, { borderColor: colors.border }]}
            onPress={() => void selectMore()}
            accessibilityRole="button"
          >
            <Text style={[styles.bannerText, { color: colors.muted }]}>
              فقط به برخی عکس‌ها دسترسی دارید.
            </Text>
            <Text style={styles.bannerAction}>انتخاب بیشتر</Text>
          </Pressable>
        )}

        <FlatList
          data={tiles}
          keyExtractor={(item) => item.key}
          renderItem={renderTile}
          numColumns={COLUMNS}
          // The grid reads right-to-left like the rest of the app.
          columnWrapperStyle={styles.row}
          getItemLayout={(_, index) => ({
            length: cell + GAP,
            offset: (cell + GAP) * Math.floor(index / COLUMNS),
            index,
          })}
          initialNumToRender={COLUMNS * 6}
          maxToRenderPerBatch={COLUMNS * 6}
          windowSize={7}
          removeClippedSubviews
          onEndReachedThreshold={1.5}
          onEndReached={() => {
            if (access !== "denied") void loadPage(false);
          }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + (selected.length ? 84 : 12),
          }}
          ListFooterComponent={
            access === "denied" ? (
              <View style={styles.denied}>
                <Text style={[styles.deniedTitle, { color: colors.text }]}>
                  دسترسی به گالری لازم است
                </Text>
                <Text style={[styles.deniedBody, { color: colors.muted }]}>
                  برای دیدن و انتخاب عکس‌ها و ویدیوهای گوشی، اجازهٔ دسترسی به
                  گالری را بدهید. می‌توانید از «فایل‌ها» هم استفاده کنید.
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.primary,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => void allowAccess()}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>
                    {canAskAgain ? "اجازه دادن" : "رفتن به تنظیمات"}
                  </Text>
                </Pressable>
              </View>
            ) : access === "checking" || (!assets.length && !exhausted) ? (
              <ActivityIndicator style={styles.spinner} color={BRAND} />
            ) : null
          }
        />

        {selected.length > 0 && (
          <View
            style={[
              styles.sendBar,
              {
                paddingBottom: 12 + insets.bottom,
                backgroundColor: colors.sheet,
                borderColor: colors.border,
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              onPress={send}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>
                {`ارسال ${persianDigits(selected.length)} مورد`}
              </Text>
            </Pressable>
            {selected.length >= MAX_MEDIA_SELECTION && (
              <Text style={[styles.limit, { color: colors.muted }]}>
                {`حداکثر ${persianDigits(MAX_MEDIA_SELECTION)} مورد در هر ارسال`}
              </Text>
            )}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.5} r={3.4} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

function VideoIcon({ color }: { color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={6.5}
        width={13}
        height={11}
        rx={2.5}
        stroke={color}
        strokeWidth={1.6}
      />
      <Path
        d="m16 10.5 5-3v9l-5-3"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function FolderIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 7A2 2 0 0 1 5.5 5h4l2 2.5h7A2 2 0 0 1 20.5 9.5v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CloseIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="m6.5 6.5 11 11m0-11-11 11"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: { fontFamily: "Yekan", fontSize: 17 },
  files: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filesText: { fontFamily: "Yekan", fontSize: 14 },
  row: { flexDirection: "row-reverse" },
  cameraTile: { alignItems: "center", justifyContent: "center", gap: 6 },
  cameraLabel: { fontFamily: "Yekan", fontSize: 13 },
  dimmed: { opacity: 0.7 },
  duration: {
    position: "absolute",
    left: 6,
    bottom: 6,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  durationText: { fontFamily: "Yekan", fontSize: 11, color: "#ffffff" },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOff: {
    borderWidth: 1.5,
    borderColor: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  checkOn: { backgroundColor: BRAND, borderWidth: 1.5, borderColor: "#ffffff" },
  checkText: { fontFamily: "Yekan", fontSize: 12, color: "#ffffff" },
  banner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { fontFamily: "Yekan", fontSize: 13 },
  bannerAction: { fontFamily: "Yekan", fontSize: 13, color: BRAND },
  denied: { paddingHorizontal: 24, paddingTop: 24 },
  deniedTitle: {
    fontFamily: "Yekan",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  deniedBody: {
    fontFamily: "Yekan",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "center",
    writingDirection: "rtl",
    marginBottom: 18,
  },
  spinner: { marginTop: 32 },
  sendBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primary: {
    height: 50,
    borderRadius: 14,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontFamily: "Yekan", fontSize: 16, color: "#ffffff" },
  limit: {
    fontFamily: "Yekan",
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
  },
  pressed: { opacity: 0.7 },
});
