import { requireOptionalNativeModule, type NativeModule } from 'expo';

export type PickedMedia = {
  /** MediaStore id of a gallery item. */
  id?: string;
  /** file:// URI of a photo or video just taken with the camera. */
  uri?: string;
  video: boolean;
};

type MediaChooserEvents = {
  onMediaRequest: (event: unknown) => void;
};

declare class NaghshmanMediaChooserModule extends NativeModule<MediaChooserEvents> {
  resolve(items: PickedMedia[]): void;
  cancel(): void;
  openSystemChooser(): void;
}

/**
 * Android only, and absent from Expo Go: without it the WebView keeps its
 * stock file chooser.
 */
export default requireOptionalNativeModule<NaghshmanMediaChooserModule>('NaghshmanMediaChooser');
