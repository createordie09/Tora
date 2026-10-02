import { ToraSettings } from '../types';

const PROTECTION_KEYS: (keyof ToraSettings)[] = [
  'isAdBlockEnabled',
  'isPopupBlockerEnabled',
  'isRedirectGuardEnabled',
  'isScarewareShieldEnabled',
  'isHttpsUpgradeEnabled',
  'isPrivacyHeadersEnabled',
  'isFingerprintProtectionEnabled',
  'isCookieAutoRejectEnabled',
  'isUrlCleanerEnabled',
  'isThirdPartyCookieBlockEnabled',
  'isReferrerTrimmingEnabled',
  'isWebRtcProtectionEnabled',
  'isSafeBrowsingEnabled',
];

export interface ProtectionScore {
  active: number;
  total: number;
  label: 'Excellente' | 'Bonne' | 'À renforcer';
  tone: 'good' | 'ok' | 'weak';
}

/** How many of Tora's protections are switched on (secure DNS counts as one more). */
export function getProtectionScore(settings: ToraSettings | undefined): ProtectionScore {
  const total = PROTECTION_KEYS.length + 1;
  const active = settings
    ? PROTECTION_KEYS.filter(k => settings[k] === true).length + (settings.secureDns && settings.secureDns !== 'off' ? 1 : 0)
    : 0;
  const ratio = active / total;
  if (ratio >= 0.85) return { active, total, label: 'Excellente', tone: 'good' };
  if (ratio >= 0.6) return { active, total, label: 'Bonne', tone: 'ok' };
  return { active, total, label: 'À renforcer', tone: 'weak' };
}
