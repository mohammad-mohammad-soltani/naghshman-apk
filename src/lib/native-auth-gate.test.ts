import assert from "node:assert/strict";
import test from "node:test";

import {
  initialNativeWebUrl,
  shouldAllowNativeGuestNavigation,
} from "./native-auth-gate.ts";

const APP_URL = "https://naghshman.ir";

test("opens the native login page until a refresh credential exists", () => {
  assert.equal(initialNativeWebUrl(APP_URL, null), `${APP_URL}/auth`);
  assert.equal(initialNativeWebUrl(APP_URL, "ref_1234567890abcdefghijklmnopqrstuv"), APP_URL);
});

test("allows guests to use only native auth routes", () => {
  assert.equal(shouldAllowNativeGuestNavigation(`${APP_URL}/auth`, APP_URL), true);
  assert.equal(shouldAllowNativeGuestNavigation(`${APP_URL}/auth?step=code`, APP_URL), true);
  assert.equal(shouldAllowNativeGuestNavigation(`${APP_URL}/auth/register`, APP_URL), true);
  assert.equal(shouldAllowNativeGuestNavigation(`${APP_URL}/home`, APP_URL), false);
  assert.equal(shouldAllowNativeGuestNavigation(`${APP_URL}/chat`, APP_URL), false);
  assert.equal(shouldAllowNativeGuestNavigation("https://evil.example/auth", APP_URL), false);
});
