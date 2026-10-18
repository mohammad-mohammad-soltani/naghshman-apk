import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type Permission,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MediaPermissionKind } from "@/lib/native-bridge";

const ANDROID_PERMISSION: Record<MediaPermissionKind, Permission> = {
  microphone: PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  camera: PermissionsAndroid.PERMISSIONS.CAMERA,
};

const COPY: Record<"microphone" | "camera" | "both", { title: string; body: string }> = {
  microphone: {
    title: "دسترسی به میکروفون خاموش است",
    body: "برای ضبط و ارسال پیام صوتی، در تنظیمات برنامه «مجوزها» را باز کنید و «میکروفون» را روشن کنید.",
  },
  camera: {
    title: "دسترسی به دوربین خاموش است",
    body: "برای گرفتن عکس و فیلم، در تنظیمات برنامه «مجوزها» را باز کنید و «دوربین» را روشن کنید.",
  },
  both: {
    title: "دسترسی به دوربین و میکروفون خاموش است",
    body: "برای ادامه، در تنظیمات برنامه «مجوزها» را باز کنید و «دوربین» و «میکروفون» را روشن کنید.",
  },
};

type Blocked = {
  kinds: MediaPermissionKind[];
  resolve: (granted: boolean) => void;
};

async function allGranted(permissions: Permission[]) {
  const results = await Promise.all(
    permissions.map((permission) => PermissionsAndroid.check(permission)),
  );
  return results.every(Boolean);
}

/**
 * Asks Android for the microphone/camera before the page's getUserMedia runs,
 * so the WebView's own request is granted silently. After "Don't ask again"
 * the system no longer prompts, so a sheet explains it and opens Settings,
 * and access is checked again when the user comes back.
 */
export function useMediaPermissions(theme: "light" | "dark") {
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const blockedRef = useRef<Blocked | null>(null);
  const awaitingSettings = useRef(false);

  const settle = useCallback((granted: boolean) => {
    const current = blockedRef.current;
    blockedRef.current = null;
    awaitingSettings.current = false;
    setBlocked(null);
    current?.resolve(granted);
  }, []);

  const ensure = useCallback(
    async (kinds: MediaPermissionKind[]): Promise<boolean> => {
      if (Platform.OS !== "android") return true;
      const permissions = kinds.map((kind) => ANDROID_PERMISSION[kind]);
      if (await allGranted(permissions)) return true;

      const results = await PermissionsAndroid.requestMultiple(permissions);
      const statuses = permissions.map((permission) => results[permission]);
      if (statuses.every((status) => status === PermissionsAndroid.RESULTS.GRANTED)) {
        return true;
      }
      if (!statuses.includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) {
        return false;
      }

      // Only one explanation at a time; an earlier one is answered as denied.
      blockedRef.current?.resolve(false);
      return new Promise<boolean>((resolve) => {
        const next = { kinds, resolve };
        blockedRef.current = next;
        setBlocked(next);
      });
    },
    [],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const current = blockedRef.current;
      if (state !== "active" || !awaitingSettings.current || !current) return;
      void allGranted(current.kinds.map((kind) => ANDROID_PERMISSION[kind])).then(
        (granted) => {
          if (blockedRef.current === current) settle(granted);
        },
      );
    });
    return () => subscription.remove();
  }, [settle]);

  const copy = blocked
    ? COPY[blocked.kinds.length > 1 ? "both" : blocked.kinds[0]]
    : null;

  const sheet = (
    <PermissionSheet
      visible={Boolean(copy)}
      title={copy?.title ?? ""}
      body={copy?.body ?? ""}
      theme={theme}
      onOpenSettings={() => {
        awaitingSettings.current = true;
        void Linking.openSettings();
      }}
      onDismiss={() => settle(false)}
    />
  );

  return { ensure, sheet };
}

function PermissionSheet({
  visible,
  title,
  body,
  theme,
  onOpenSettings,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  body: string;
  theme: "light" | "dark";
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const dark = theme === "dark";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        accessibilityLabel="بستن"
      />
      <View
        style={[
          styles.sheet,
          dark ? styles.sheetDark : styles.sheetLight,
          { paddingBottom: 20 + insets.bottom },
        ]}
      >
        <View style={[styles.grabber, dark && styles.grabberDark]} />
        <Text style={[styles.title, dark && styles.textDark]}>{title}</Text>
        <Text style={[styles.body, dark && styles.mutedDark]}>{body}</Text>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={onOpenSettings}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>رفتن به تنظیمات</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={onDismiss}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryText, dark && styles.mutedDark]}>
            بعداً
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  sheetLight: { backgroundColor: "#ffffff" },
  sheetDark: { backgroundColor: "#1c1c1e" },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d4d4d8",
    marginBottom: 18,
  },
  grabberDark: { backgroundColor: "#3f3f46" },
  title: {
    fontFamily: "Yekan",
    fontSize: 18,
    color: "#101010",
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 8,
  },
  body: {
    fontFamily: "Yekan",
    fontSize: 14,
    lineHeight: 24,
    color: "#52525b",
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 22,
  },
  textDark: { color: "#f5f5f7" },
  mutedDark: { color: "#a1a1aa" },
  primary: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontFamily: "Yekan", fontSize: 16, color: "#ffffff" },
  secondary: {
    height: 46,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontFamily: "Yekan", fontSize: 15, color: "#52525b" },
  pressed: { opacity: 0.75 },
});
