// Android's gallery (MediaStore) only accepts files whose extension matches a
// real image or video type; the extension comes from the download's
// Content-Type, since proxied media URLs such as /api/content/1/media/2 have none.
const GALLERY_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
  'avif',
  'bmp',
  'mp4',
  'm4v',
  'mov',
  'webm',
  '3gp',
  'mkv',
]);

export function fileExtension(name: string): string | null {
  const match = /\.([a-z0-9]{2,5})$/iu.exec(name);
  return match ? match[1].toLowerCase() : null;
}

export function isGalleryMedia(name: string): boolean {
  const extension = fileExtension(name);
  return extension !== null && GALLERY_EXTENSIONS.has(extension);
}

/** A unique, ASCII-only name, so repeated saves never collide in the gallery. */
export function galleryFilename(downloadedName: string, now: number): string {
  const extension = fileExtension(downloadedName) ?? 'jpg';
  return `naghshman-${now}.${extension === 'jpeg' ? 'jpg' : extension}`;
}
