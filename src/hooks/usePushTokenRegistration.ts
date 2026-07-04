import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';

// usePushTokenRegistration — 16b push, Route B (device_tokens).
//
// Captures THIS device's Expo push token and upserts it against the authenticated
// entity via the upsert_device_token RPC (hearth-network 0011). The entity is
// NEVER passed to the RPC — the server derives the owner from current_entity_id()
// (anti-spoof). Client code only ever writes through the RPC; it never touches the
// device_tokens table directly.
//
// B.1 (CLAUDE.md) — this is an INIT EFFECT keyed on the authenticated entity, NOT
// a first-tap trigger. It fires only after the entity has loaded and runs at most
// once per entity per app session (the RPC is idempotent, so re-runs are harmless;
// the guard just avoids re-minting on every refresh/render).
//
// OPS GATE — real token minting needs `extra.eas.projectId` in app.json, which
// lands with `eas init` + the expo-notifications prebuild/rebuild (a SEPARATE,
// ops-gated step Derrick runs). Until then projectId is undefined and we LOG AND
// SKIP — never crash. This code lands + typechecks now; the token actually mints
// once the ops gate opens. No app.json plugin entry is added here by design.

/** The EAS projectId from app.json's extra.eas, or undefined pre-`eas init`. */
function resolveProjectId(): string | undefined {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof easProjectId === 'string' && easProjectId.length > 0
    ? easProjectId
    : undefined;
}

export default function usePushTokenRegistration(): void {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  // The entity id we've already registered a token for this session. Keeps the
  // effect idempotent across background refreshes without re-hitting the RPC.
  const registeredForEntity = useRef<string | null>(null);

  useEffect(() => {
    if (!entityId) {
      return; // gate: authenticated entity only — never runs signed-out.
    }
    if (registeredForEntity.current === entityId) {
      return; // already registered this entity this session.
    }

    // Push tokens only exist on real mobile platforms; the RPC's platform CHECK
    // is ios/android. Skip anything else (web/etc.) before prompting.
    const os = Platform.OS;
    if (os !== 'ios' && os !== 'android') {
      console.info(`[push] platform ${os} has no push token; skipping registration`);
      return;
    }

    const projectId = resolveProjectId();
    if (!projectId) {
      // OPS GATE not open yet — expected until `eas init` writes extra.eas.projectId.
      console.info(
        '[push] skipping token registration: no extra.eas.projectId in app.json ' +
          '(ops gate: run `eas init` + the expo-notifications prebuild/rebuild first)',
      );
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const permission = await Notifications.requestPermissionsAsync();
        if (cancelled) {
          return;
        }
        if (!permission.granted) {
          console.info('[push] notifications permission not granted; no token captured');
          return;
        }

        const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled) {
          return;
        }

        // p_platform from Platform.OS (narrowed to 'ios' | 'android' above).
        // NEVER pass an entity id — the RPC derives the owner server-side.
        const { error } = await supabase.rpc('upsert_device_token', {
          p_token: tokenResult.data,
          p_platform: os,
        });
        if (error) {
          console.error('[push] upsert_device_token failed:', error);
          return;
        }

        registeredForEntity.current = entityId;
      } catch (err) {
        console.error('[push] token registration error:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entityId]);
}
