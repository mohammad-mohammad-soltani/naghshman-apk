/// <reference types="node" />
import { existsSync } from "node:fs";
import type { ConfigContext, ExpoConfig } from "expo/config";

// Android push tokens come from Firebase Cloud Messaging: without this file
// `getExpoPushTokenAsync` throws on Android and the app can never receive a
// notification. On EAS, upload it as a file environment variable named
// GOOGLE_SERVICES_JSON; locally, drop it next to app.json.
const LOCAL_GOOGLE_SERVICES = "./google-services.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (existsSync(LOCAL_GOOGLE_SERVICES) ? LOCAL_GOOGLE_SERVICES : undefined);

  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
