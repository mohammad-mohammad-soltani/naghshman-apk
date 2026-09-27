import assert from "node:assert/strict";
import test from "node:test";

import {
  isExpoPushToken,
  nativeNotificationRoute,
  supportsNativePushNotifications,
} from "./native-push.ts";

const APP_URL = "https://naghshman.ir";

test("accepts only Expo push tokens", () => {
  assert.equal(isExpoPushToken("ExponentPushToken[abc_123-xyz]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken[device-token]"), true);
  assert.equal(isExpoPushToken("not-a-push-token"), false);
  assert.equal(isExpoPushToken("ExponentPushToken[]"), false);
});

test("maps a notification deep link to an in-app route", () => {
  assert.equal(
    nativeNotificationRoute({ url: "/chat/conversation-1" }, APP_URL),
    "/chat/conversation-1",
  );
  assert.equal(
    nativeNotificationRoute({ deep_link: "https://naghshman.ir/posts/42?from=push" }, APP_URL),
    "/posts/42?from=push",
  );
});

test("rejects notification navigation outside the application", () => {
  assert.equal(
    nativeNotificationRoute({ url: "https://evil.example/auth" }, APP_URL),
    null,
  );
  assert.equal(nativeNotificationRoute({ url: "javascript:alert(1)" }, APP_URL), null);
  assert.equal(nativeNotificationRoute({}, APP_URL), null);
});

test("skips remote push only in Android Expo Go", () => {
  assert.equal(supportsNativePushNotifications("android", "storeClient"), false);
  assert.equal(supportsNativePushNotifications("android", "standalone"), true);
  assert.equal(supportsNativePushNotifications("ios", "storeClient"), true);
  assert.equal(supportsNativePushNotifications(null, "standalone"), false);
});
