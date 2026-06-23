import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { MediaUploadError, uploadImageFromUri } from '../services/storage';
import { MAX_GALLERY_IMAGES } from '../utils/card-fields';

// useGalleryUpload — MULTI-image picker → on-device compress → upload, for the
// Day 15 content-card gallery. Deliberately SEPARATE from useMediaUpload (the
// single-image path for onboarding / card media): per-image progress, partial
// success, and retry-failed cannot be represented in the single hook's state, so
// widening it would regress the simple paths. The single primitive both share is
// services/storage (uploadImageFromUri).
//
// COMPRESS-DON'T-REJECT: every pick is downscaled (longest edge → MAX_EDGE) and
// re-encoded JPEG at COMPRESS via expo-image-manipulator BEFORE upload, so the
// 10 MB Storage cap rarely fires. The count cap (MAX_GALLERY_IMAGES) is a UX /
// storage ceiling — take-what-fits, never reject the batch.
//
// On EACH successful image it calls onUploaded(url); the caller appends the URL
// to the card's gallery state (repeated gallery_image reserved fields).

// Longest-edge target after resize. Portfolio photos look crisp at this size and
// land comfortably under the Storage cap once JPEG-compressed.
const MAX_EDGE = 1600;
// JPEG quality (0–1). 0.7 is a strong size win with little visible loss.
const COMPRESS = 0.7;

/** One picked image awaiting compress+upload (held for retry on failure). */
interface PendingImage {
  uri: string;
  width: number;
  height: number;
}

/** Per-batch progress, in IMAGES (supabase-js gives no per-byte callback). */
export interface GalleryUploadProgress {
  total: number;
  completed: number;
  failed: number;
}

interface UseGalleryUploadResult {
  uploading: boolean;
  /** Non-null only while a batch is in flight or ended with failures. */
  progress: GalleryUploadProgress | null;
  error: string | null;
  hasFailures: boolean;
  /** Pick up to `remainingSlots` images and upload them (take-what-fits). */
  pickAndUpload: (remainingSlots: number) => Promise<void>;
  /** Re-upload only the images that failed in the last batch. */
  retryFailed: () => Promise<void>;
  clearError: () => void;
}

export default function useGalleryUpload(
  entityId: string | null,
  onUploaded: (url: string) => void,
): UseGalleryUploadResult {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<GalleryUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<PendingImage[]>([]);

  // Downscale (only if larger than the target) and re-encode JPEG. Returns the
  // compressed file URI; on any manipulator failure falls back to the original
  // URI so the image still gets a chance to upload (size guard catches a huge
  // original downstream).
  const compress = useCallback(async (img: PendingImage): Promise<string> => {
    try {
      const longest = Math.max(img.width, img.height);
      let ctx = ImageManipulator.manipulate(img.uri);
      if (longest > MAX_EDGE) {
        ctx =
          img.width >= img.height
            ? ctx.resize({ width: MAX_EDGE })
            : ctx.resize({ height: MAX_EDGE });
      }
      const ref = await ctx.renderAsync();
      const out = await ref.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
      return out.uri;
    } catch (err) {
      console.warn('[useGalleryUpload] compress failed, using original:', err);
      return img.uri;
    }
  }, []);

  // Sequential compress+upload (bounded memory / Storage subrequests). Each
  // success fires onUploaded; failures are collected for retry. Partial success
  // is the norm, never an all-or-nothing reject.
  const process = useCallback(
    async (images: PendingImage[]): Promise<void> => {
      if (!entityId || images.length === 0) {
        return;
      }
      setUploading(true);
      setError(null);

      let completed = 0;
      let failedCount = 0;
      const stillFailed: PendingImage[] = [];
      setProgress({ total: images.length, completed: 0, failed: 0 });

      for (const img of images) {
        const uri = await compress(img);
        try {
          const { url } = await uploadImageFromUri(entityId, uri);
          onUploaded(url);
          completed += 1;
        } catch (err) {
          failedCount += 1;
          stillFailed.push(img);
          if (!(err instanceof MediaUploadError)) {
            console.error('[useGalleryUpload] upload failed:', err);
          }
        }
        setProgress({ total: images.length, completed, failed: failedCount });
      }

      setFailed(stillFailed);
      setUploading(false);
      if (failedCount > 0) {
        setError(
          `${completed} added · ${failedCount} didn't upload. Tap retry to try those again.`,
        );
      } else {
        setProgress(null); // clean finish → clear the counter
      }
    },
    [entityId, onUploaded, compress],
  );

  const pickAndUpload = useCallback(
    async (remainingSlots: number): Promise<void> => {
      if (!entityId) {
        setError('Set up your profile before adding photos.');
        return;
      }
      if (uploading) {
        return;
      }
      if (remainingSlots <= 0) {
        setError(
          `Your gallery is full (${MAX_GALLERY_IMAGES}). Remove a photo to add more.`,
        );
        return;
      }

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Allow photo access in Settings to add photos.');
        return;
      }
      setError(null);

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          selectionLimit: remainingSlots, // OS-side cap (iOS); sliced below too
          quality: 1, // we compress ourselves via the manipulator
        });
      } catch (err) {
        console.error('[useGalleryUpload] picker threw:', err);
        setError("Couldn't open the picker. Try again.");
        return;
      }
      if (result.canceled || !result.assets?.length) {
        return; // backed out — not an error
      }

      // Take-what-fits: never reject the batch. Slice to the remaining slots and
      // tell the user how many didn't fit (guide, don't scold).
      let assets = result.assets;
      let skipped = 0;
      if (assets.length > remainingSlots) {
        skipped = assets.length - remainingSlots;
        assets = assets.slice(0, remainingSlots);
      }
      const images: PendingImage[] = assets.map((a) => ({
        uri: a.uri,
        width: a.width ?? 0,
        height: a.height ?? 0,
      }));

      await process(images);

      if (skipped > 0) {
        // Don't clobber an upload-failure message; only add the cap note if clear.
        setError(
          (prev) =>
            prev ??
            `Added ${images.length} · ${skipped} didn't fit (gallery holds ${MAX_GALLERY_IMAGES}). Remove a photo to add more.`,
        );
      }
    },
    [entityId, uploading, process],
  );

  const retryFailed = useCallback(async (): Promise<void> => {
    if (uploading || failed.length === 0) {
      return;
    }
    await process(failed);
  }, [uploading, failed, process]);

  const clearError = useCallback((): void => setError(null), []);

  return {
    uploading,
    progress,
    error,
    hasFailures: failed.length > 0,
    pickAndUpload,
    retryFailed,
    clearError,
  };
}
