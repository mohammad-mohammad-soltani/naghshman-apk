import { Directory, File, Paths } from "expo-file-system";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { Platform } from "react-native";

import MediaChooser from "../../modules/naghshman-media-chooser";
import {
  reduceDownloads,
  type DownloadItem,
  type DownloadKind,
} from "@/lib/downloads";
import {
  galleryFilename,
  isGalleryMedia,
  openedFilename,
} from "@/lib/media-save";

export type NoticeTone = "info" | "success" | "error";
type Notify = (message: string, tone?: NoticeTone) => void;

// Downloaded attachments handed to a viewer app (FileProvider: cache-path).
const openedFilesDirectory = () => new Directory(Paths.cache, "opened-files");
// Progress events arrive per chunk; the tray only needs a few a second.
const PROGRESS_INTERVAL_MS = 120;

const FAILED_DOWNLOAD = "دریافت نشد · اتصال را بررسی کنید";

function deleteQuietly(entry: Directory | null) {
  try {
    entry?.delete();
  } catch {
    // The OS clears the cache directory eventually.
  }
}

/**
 * Runs the app's downloads: attachments to open in a viewer app and media to
 * save in the gallery. Any number run side by side, each with its own
 * progress, cancel and retry, for the downloads tray to show.
 */
export function useDownloads(
  notify: Notify,
  openExternal: (url: string) => void,
) {
  const [items, dispatch] = useReducer(reduceDownloads, []);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const controllers = useRef(new Map<string, AbortController>());
  // Attachments already downloaded this run open again without the network.
  const openedFiles = useRef(new Map<string, string>());
  const sequence = useRef(0);

  // Files opened in a previous run are no longer read by any viewer app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    try {
      const directory = openedFilesDirectory();
      if (directory.exists) directory.delete();
    } catch {
      // The OS clears the cache directory eventually.
    }
  }, []);

  useEffect(
    () => () => {
      for (const controller of controllers.current.values()) controller.abort();
    },
    [],
  );

  const openDownloaded = useCallback(
    async (uri: string) => {
      if (!MediaChooser) return;
      if (!(await MediaChooser.openFile(uri, null))) {
        notify("برنامه‌ای برای باز کردن این فایل روی گوشی نصب نیست.", "error");
      }
    },
    [notify],
  );

  /** Downloads into a fresh folder of `parent`, reporting progress to the tray. */
  const download = useCallback(
    async (id: string, url: string, parent: Directory, signal: AbortSignal) => {
      const folder = new Directory(parent, id);
      folder.create({ intermediates: true, idempotent: true });
      let last = 0;
      try {
        // Attachments behind the site's session need its cookies.
        const cookie = MediaChooser?.cookiesFor(url);
        const file = await File.downloadFileAsync(url, folder, {
          idempotent: true,
          headers: cookie ? { Cookie: cookie } : undefined,
          signal,
          onProgress: ({ bytesWritten, totalBytes }) => {
            const now = Date.now();
            if (
              now - last < PROGRESS_INTERVAL_MS &&
              bytesWritten !== totalBytes
            )
              return;
            last = now;
            dispatch({
              type: "progress",
              id,
              bytes: bytesWritten,
              total: totalBytes,
            });
          },
        });
        return { file, folder };
      } catch (error) {
        deleteQuietly(folder);
        throw error;
      }
    },
    [],
  );

  const run = useCallback(
    async (kind: DownloadKind, url: string, requestedName?: string) => {
      const id = `${Date.now().toString(36)}-${++sequence.current}`;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      dispatch({
        type: "start",
        id,
        kind,
        url,
        requestedName,
        name: requestedName || (kind === "media" ? "رسانه" : "فایل"),
      });

      let staging: Directory | null = null;
      try {
        if (kind === "file") {
          const { file } = await download(
            id,
            url,
            openedFilesDirectory(),
            controller.signal,
          );
          const name = openedFilename(requestedName, file.name);
          if (name !== file.name) file.rename(name);
          dispatch({ type: "named", id, name });
          openedFiles.current.set(url, file.uri);
          dispatch({ type: "done", id });
          // The viewer app reads it from the cache, so it stays until next launch.
          if (!controller.signal.aborted) await openDownloaded(file.uri);
          return;
        }

        // Download into an empty folder: the file is then named from the
        // response's Content-Type, so proxied media without an extension in its
        // URL (e.g. /api/content/1/media/2) still lands as .mp4 or .jpg.
        const { file, folder } = await download(
          id,
          url,
          new Directory(Paths.cache, "gallery-saves"),
          controller.signal,
        );
        staging = folder;
        if (!isGalleryMedia(file.name)) {
          dispatch({ type: "failed", id, error: "تصویر یا ویدیو نیست" });
          return;
        }
        if (!requestedName) dispatch({ type: "named", id, name: file.name });
        file.rename(galleryFilename(file.name, Date.now()));
        const MediaLibrary = await import("expo-media-library/legacy");
        await MediaLibrary.createAssetAsync(file.uri);
        dispatch({ type: "done", id });
      } catch {
        // A cancelled row is already gone from the tray.
        if (!controller.signal.aborted) {
          dispatch({ type: "failed", id, error: FAILED_DOWNLOAD });
        }
      } finally {
        controllers.current.delete(id);
        // MediaStore keeps its own copy; the download is only a staging file.
        deleteQuietly(staging);
      }
    },
    [download, openDownloaded],
  );

  const openFile = useCallback(
    async (url: string, filename?: string) => {
      // Without the native module (iOS, Expo Go) the in-app browser previews it.
      if (Platform.OS !== "android" || !MediaChooser) {
        openExternal(url);
        return;
      }
      const cached = openedFiles.current.get(url);
      if (cached && new File(cached).exists) {
        await openDownloaded(cached);
        return;
      }
      if (
        itemsRef.current.some(
          (item) => item.url === url && item.status === "downloading",
        )
      ) {
        notify("این فایل در حال دریافت است.");
        return;
      }
      await run("file", url, filename);
    },
    [notify, openDownloaded, openExternal, run],
  );

  const saveMedia = useCallback(
    async (url: string, filename?: string) => {
      if (Platform.OS !== "android") return;
      if (
        itemsRef.current.some(
          (item) => item.url === url && item.status === "downloading",
        )
      ) {
        notify("این رسانه در حال ذخیره است.");
        return;
      }
      try {
        // Expo Go on Android does not bundle the full media-library native module.
        // Loading it only when saving keeps the rest of the app usable in Expo Go.
        const MediaLibrary = await import("expo-media-library/legacy");
        const permission = await MediaLibrary.requestPermissionsAsync(true, [
          "photo",
          "video",
        ]);
        if (permission.status !== "granted") {
          notify("برای ذخیره، اجازهٔ دسترسی به گالری لازم است.", "error");
          return;
        }
      } catch {
        notify("ذخیره در گالری روی این نسخه ممکن نیست.", "error");
        return;
      }
      await run("media", url, filename);
    },
    [notify, run],
  );

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    dispatch({ type: "remove", id });
  }, []);

  const retry = useCallback(
    (item: DownloadItem) => {
      dispatch({ type: "remove", id: item.id });
      if (item.kind === "file") void openFile(item.url, item.requestedName);
      else void saveMedia(item.url, item.requestedName);
    },
    [openFile, saveMedia],
  );

  /** Opens a finished attachment again from its row. */
  const open = useCallback(
    (item: DownloadItem) => {
      if (item.kind === "file") void openFile(item.url, item.requestedName);
    },
    [openFile],
  );

  const clearSettled = useCallback(
    () => dispatch({ type: "clear-settled" }),
    [],
  );

  return { items, openFile, saveMedia, cancel, retry, open, clearSettled };
}
