import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import useAuth from '../hooks/useAuth';
import useEntity from '../hooks/useEntity';
import { APP_NAME } from '../constants/app';
import { theme } from '../styles/theme';

// IdentityPanel — the "My ID" view inside the account menu (Day 17A). Layout
// lifted from the now-deleted IdentityScreen and expanded to the prototype's
// trust-tier identity surface: the vendor's public Deus address (with a QR to
// present it), their account email + unverified phone, and the three verification
// pills. All fields come from the own entity row (useEntity, select '*') + the
// auth user — no network call.
//
// Sign-out is NOT here: it lives at the bottom of the account menu (AccountChip),
// reusing <SignOutButton inline/>. This panel is identity-only.
//
// Honesty rule (CLAUDE.md): a verification pill renders its REAL state — amber
// "verified" when the flag is true, a muted "not verified" when false. It never
// shows a plausible verified-looking placeholder for an unverified vendor.

interface VerificationPillProps {
  label: string;
  verified: boolean;
}

/** One verification pill — amber+dot when verified, muted outline when not. */
function VerificationPill({ label, verified }: VerificationPillProps) {
  return (
    <View
      style={[styles.pill, verified ? styles.pillOn : styles.pillOff]}
      accessibilityRole="text"
    >
      {verified ? <View style={styles.pillDot} /> : null}
      <Text style={[styles.pillLabel, verified ? styles.pillLabelOn : styles.pillLabelOff]}>
        {verified ? `${label} verified` : `${label} not verified`}
      </Text>
    </View>
  );
}

/** One labelled identity field row (label above, value below). */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function IdentityPanel() {
  const { user } = useAuth();
  const { entity } = useEntity();

  const deusId = entity?.deus_id ?? null;
  // Prefer the auth email (the account's source of truth); fall back to the
  // entity copy. Phone is the entity value (stored unverified by design — no
  // phone badge, per TODO(SMS) / Decision 1A).
  const email = user?.email ?? entity?.email ?? null;
  const phone = entity?.phone ?? null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Public Deus address + QR to present it. QR encodes the BARE deus_id
          only — never email, phone, or the entity uuid. */}
      <View style={styles.qrBlock}>
        {deusId ? (
          <>
            <View style={styles.qrFrame}>
              <QRCode
                value={deusId}
                size={168}
                color={theme.colors.textPrimary}
                backgroundColor="transparent"
              />
            </View>
            <Text style={styles.deusId}>{deusId}</Text>
            <Text style={styles.deusIdCaption}>Your {APP_NAME} ID — present this to be found</Text>
          </>
        ) : (
          <Text style={styles.deusIdCaption}>No {APP_NAME} ID yet</Text>
        )}
      </View>

      <View style={styles.pillRow}>
        <VerificationPill label="ID" verified={entity?.id_verified ?? false} />
        <VerificationPill label="Business" verified={entity?.business_verified ?? false} />
        <VerificationPill label="Credential" verified={entity?.credential_verified ?? false} />
      </View>

      <View style={styles.fields}>
        <Field label="Email" value={email ?? '—'} />
        <Field label="Phone" value={phone ?? '—'} />
      </View>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    gap: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
  },
  qrBlock: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  qrFrame: {
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.card,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.xs,
  },
  deusId: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    letterSpacing: 2,
  },
  deusIdCaption: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
  },
  pillOn: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentFill,
  },
  pillOff: {
    borderColor: theme.colors.hairline,
    backgroundColor: 'transparent',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  pillLabel: {
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontFamily: theme.fonts.semiBold,
  },
  pillLabelOn: {
    color: theme.colors.accent,
  },
  pillLabelOff: {
    color: theme.colors.textMuted,
  },
  fields: {
    gap: theme.spacing.lg,
  },
  field: {
    gap: 2,
  },
  fieldLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  fieldValue: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
});
