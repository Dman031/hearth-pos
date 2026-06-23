/**
 * storage — Supabase Storage upload for card media (Day 12.5).
 *
 * Pure, React-free upload + validation so it can be REUSED by Day 14 (menu photo
 * → cards). The output is a public Storage URL that flows into a card's existing
 * reserved `media_url` field (see utils/card-fields.ts) — no new column, render
 * side unchanged.
 *
 * Bucket + RLS live in supabase/migrations/0002_card_media_storage.sql: vendors
 * may only write under a folder named after an entity they own
 * (`{entity_id}/...`); read is public. See DEFERRED.md for the public-read
 * tradeoff (image is reachable by URL regardless of the card's see_perm).
 */
import { supabase } from './supabase';

export const MEDIA_BUCKET = 'card-media';
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * The minimal slice of an expo-image-picker `ImagePickerAsset` this module
 * needs. Kept local (not importing the picker type) so a non-picker caller
 * (Day 14) can feed it too.
 */
export interface UploadableImage {
  base64?: string | null;
  mimeType?: string | null;
  type?: string | null; // 'image' | 'video' | 'livePhoto' | ...
  fileName?: string | null;
}

export interface UploadResult {
  url: string;
  path: string;
}

/** Vendor-facing failure — its `message` is safe to show in the UI. */
export class MediaUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

// `atob` is a Hermes global (RN 0.83) but isn't reliably in the TS lib across
// configs, so reach it through globalThis instead of declaring it (which would
// risk a redeclare conflict). Guarded so a missing global fails loudly.
function base64ToBytes(base64: string): Uint8Array {
  const decode = (globalThis as { atob?: (data: string) => string }).atob;
  if (!decode) {
    throw new MediaUploadError("Couldn't process that image on this device.");
  }
  const binary = decode(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Decoded byte length of a base64 string, without allocating the buffer. */
function base64ByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) {
    return 0;
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (len * 3) / 4 - padding;
}

// Math.random uniqueness is sufficient here — the path is owner-scoped and the
// filename only has to not collide within one vendor's folder.
function makeFilename(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}.jpg`;
}

/**
 * Validate type + size BEFORE upload. Throws MediaUploadError (vendor-facing
 * message) on rejection — images only, ≤ MAX_MEDIA_BYTES, base64 present.
 */
export function validateImageAsset(asset: UploadableImage): void {
  const isImage =
    asset.type === 'image' ||
    (typeof asset.mimeType === 'string' && asset.mimeType.startsWith('image/'));
  if (!isImage) {
    throw new MediaUploadError(
      "That file isn't an image. Pick a photo to upload.",
    );
  }
  if (!asset.base64) {
    throw new MediaUploadError("Couldn't read that image. Try another photo.");
  }
  if (base64ByteLength(asset.base64) > MAX_MEDIA_BYTES) {
    throw new MediaUploadError('That image is over 10 MB. Pick a smaller one.');
  }
}

/**
 * Validate, then upload the image to `card-media/{entityId}/...` and return its
 * public URL. expo-image-picker delivers `base64` as JPEG data regardless of the
 * source format (per SDK 55 ImagePicker docs), so it is stored as image/jpeg.
 */
export async function uploadImageAsset(
  entityId: string,
  asset: UploadableImage,
): Promise<UploadResult> {
  if (!entityId) {
    throw new MediaUploadError('Set up your profile before adding media.');
  }
  validateImageAsset(asset);

  const bytes = base64ToBytes(asset.base64 as string);
  const path = `${entityId}/${makeFilename()}`;

  // Destructure { error } per the SUPABASE WRITE RULE — a silent failure here
  // would otherwise return a getPublicUrl for a file that was never written.
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) {
    console.error('[storage] card-media upload failed:', uploadError);
    throw new MediaUploadError(
      "That didn't upload. Check your connection and try again.",
    );
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new MediaUploadError('Upload finished but no URL came back. Try again.');
  }
  return { url: data.publicUrl, path };
}

/**
 * Upload an image from a local file URI (Day 15 gallery path). The gallery hook
 * compresses each pick with expo-image-manipulator, which yields a file URI, not
 * base64 — fetching the URI to bytes avoids holding a base64 string per image in
 * memory (a real cost across a 12-photo batch on Hermes). Same bucket, same
 * owner-scoped `{entityId}/...` path, same public URL contract as
 * uploadImageAsset; only the input form differs.
 */
export async function uploadImageFromUri(
  entityId: string,
  uri: string,
): Promise<UploadResult> {
  if (!entityId) {
    throw new MediaUploadError('Set up your profile before adding media.');
  }

  let bytes: Uint8Array;
  try {
    const res = await fetch(uri);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    console.error('[storage] could not read image uri:', err);
    throw new MediaUploadError("Couldn't read that image. Try another photo.");
  }
  if (bytes.byteLength === 0) {
    throw new MediaUploadError("Couldn't read that image. Try another photo.");
  }
  // Defense in depth behind the manipulator compression — should rarely fire.
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new MediaUploadError('That image is over 10 MB. Pick a smaller one.');
  }

  const path = `${entityId}/${makeFilename()}`;

  // Destructure { error } per the SUPABASE WRITE RULE — a silent failure here
  // would otherwise return a getPublicUrl for a file that was never written.
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) {
    console.error('[storage] card-media uri upload failed:', uploadError);
    throw new MediaUploadError(
      "That didn't upload. Check your connection and try again.",
    );
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new MediaUploadError('Upload finished but no URL came back. Try again.');
  }
  return { url: data.publicUrl, path };
}
