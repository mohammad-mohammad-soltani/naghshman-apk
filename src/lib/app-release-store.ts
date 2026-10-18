import { File, Paths } from "expo-file-system";

import { parseAppReleaseStatus, type AppReleaseStatus } from "@/lib/app-release";

// The last answer from the site, so a forced update also holds on an offline
// launch: once told to update, an old install never runs again until replaced.

function releaseFile(): File {
  return new File(Paths.document, "app-release.json");
}

export function readStoredRelease(): AppReleaseStatus | null {
  try {
    const file = releaseFile();
    return file.exists ? parseAppReleaseStatus(JSON.parse(file.textSync())) : null;
  } catch {
    return null;
  }
}

export function storeRelease(status: AppReleaseStatus) {
  try {
    const file = releaseFile();
    file.create({ overwrite: true });
    file.write(JSON.stringify(status));
  } catch {
    // The next successful check writes it again.
  }
}
