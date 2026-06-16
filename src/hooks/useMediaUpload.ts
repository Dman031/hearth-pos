import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { MediaUploadError, uploadImageAsset } from '../services/storage';

// useMediaUpload — the UX glue around picking/taking a photo and uploading it to
// Supabase Storage (Day 12.5). Owns permission prompts, picker launch, and the
// uploading/error state; delegates the actual upload to services/storage so the
// logic is REUSED by Day 14 (menu photo → cards).
//
// On success it calls `onUploaded(url)` with the public Storage URL — the caller
// writes that into the card's existing media_url field. Errors surface as
// vendor-facing strings in `error` (never thrown to the caller).

interface UseMediaUploadResult {
  uploading: boolean;
  error: string | null;
  pickFromLibrary: () => Promise<void>;
  takePhoto: () => Promise<void>;
  clearError: () => void;
}

// Shared picker options: images only (the new SDK 55 array form, NOT the
// deprecated MediaTypeOptions), base64 so the upload needs no expo-file-system,
// quality < 1 to keep most photos comfortably under the 10 MB cap.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  base64: true,
  quality: 0.8,
  allowsMultipleSelection: false,
};

export default function useMediaUpload(
  entityId: string | null,
  onUploaded: (url: string) => void,
): UseMediaUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (
      launch: () => Promise<ImagePicker.ImagePickerResult>,
    ): Promise<void> => {
      if (uploading) {
        return;
      }
      if (!entityId) {
        setError('Set up your profile before adding media.');
        return;
      }
      setError(null);

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await launch();
      } catch (err) {
        console.error('[useMediaUpload] picker threw:', err);
        setError("Couldn't open the picker. Try again.");
        return;
      }
      if (result.canceled || !result.assets?.[0]) {
        return; // user backed out — not an error
      }

      setUploading(true);
      try {
        const { url } = await uploadImageAsset(entityId, result.assets[0]);
        onUploaded(url);
      } catch (err) {
        if (err instanceof MediaUploadError) {
          setError(err.message);
        } else {
          console.error('[useMediaUpload] upload failed:', err);
          setError("That didn't upload. Try again.");
        }
      } finally {
        setUploading(false);
      }
    },
    [entityId, onUploaded, uploading],
  );

  const pickFromLibrary = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Allow photo access in Settings to choose a photo.');
      return;
    }
    await run(() => ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
  }, [run]);

  const takePhoto = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Allow camera access in Settings to take a photo.');
      return;
    }
    await run(() => ImagePicker.launchCameraAsync(PICKER_OPTIONS));
  }, [run]);

  const clearError = useCallback((): void => setError(null), []);

  return { uploading, error, pickFromLibrary, takePhoto, clearError };
}
