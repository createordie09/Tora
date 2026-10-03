import { useState, useEffect, useRef } from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DomainSettings } from '../types';
import { popIn } from '../lib/motion';
import { useModalA11y } from '../hooks/useModalA11y';

const PERMISSION_LABELS: Record<string, string> = {
  media: 'Caméra/micro',
  camera: 'Caméra',
  microphone: 'Micro',
  notifications: 'Notifications',
  geolocation: 'Localisation',
};

export default function SiteSettingsMenu({ domain, security }: { domain: string; security?: 'secure' | 'insecure' | 'internal' | 'broken' }) {
  const [open, setOpen] = useState(false);
  const [ds, setDs] = useState<DomainSettings>({});

  const setOpenState = (next: boolean) => {
    setOpen(next);
    window.tora?.setOverlayActive('site-settings-menu', next);
  };

  useEffect(() => {
    if (open) window.tora?.getDomainSettings(domain).then(setDs);
  }, [open, domain]);

  const menuRef = useRef<HTMLDivElement>(null);
  useModalA11y(menuRef, open, () => setOpenState(false));

  const toggle = async (key: 'adBlockDisabled' | 'darkModeForced' | 'thirdPartyCookiesAllowed') => {
    const updated = await window.tora?.setDomainSetting(domain, key, !ds[key]);
    if (updated) setDs(updated);
  };

  const resetPermissions = async () => {
    await window.tora?.clearDomainPermissions(domain);
    const updated = await window.tora?.getDomainSettings(domain);
    if (updated) setDs(updated);
  };

  const grantedPermissions = Object.entries(ds.permissions || {}).filter(([, v]) => v === 'granted');

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Réglages et permissions du site"
        aria-expanded={open}
        title="Réglages du site"
        onClick={() => setOpenState(!open)}
        className="p-2 mr-1 hover:bg-surface-3 rounded-md transition-colors shrink-0"
      >
        <SlidersHorizontal size={13} className="text-muted hover:text-white" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenState(false)} />
            <motion.div
              {...popIn}
              ref={menuRef}
              style={{ originX: 0, originY: 0 }}
              role="dialog"
              aria-label={`Paramètres pour ${domain}`}
              className="absolute top-full mt-2 left-0 w-64 bg-surface-2 border border-line rounded-xl shadow-2xl z-50 text-[12px] text-ink overflow-hidden"
            >
              <div className="px-3 py-2.5 border-b border-line">
                <div className="text-[12px] text-muted font-medium truncate">{domain}</div>
                {security && security !== 'internal' && (
                  <div className={`mt-1 text-[12px] ${security === 'secure' ? 'text-emerald-400' : security === 'insecure' ? 'text-amber-300' : 'text-red-400'}`}>
                    {security === 'secure' ? 'Connexion sécurisée (HTTPS)' : security === 'insecure' ? 'Connexion non sécurisée (HTTP)' : 'Certificat invalide'}
                  </div>
                )}
              </div>

              <div className="p-2 border-b border-line">
                <label className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-3 cursor-pointer">
                  <span>Bloqueur de pub sur ce site</span>
                  <input type="checkbox" checked={!ds.adBlockDisabled} onChange={() => toggle('adBlockDisabled')} className="accent-indigo-500" />
                </label>
                <label className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-3 cursor-pointer">
                  <span>Autoriser les cookies tiers</span>
                  <input type="checkbox" checked={!!ds.thirdPartyCookiesAllowed} onChange={() => toggle('thirdPartyCookiesAllowed')} className="accent-indigo-500" />
                </label>
                <label className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-3 cursor-pointer">
                  <span>Mode sombre forcé</span>
                  <input type="checkbox" checked={!!ds.darkModeForced} onChange={() => toggle('darkModeForced')} className="accent-indigo-500" />
                </label>
              </div>

              <div className="p-2">
                <div className="px-2 py-1 text-[12px] text-muted font-semibold uppercase tracking-wider">Permissions accordées</div>
                {grantedPermissions.length === 0 ? (
                  <p className="px-2 py-1.5 text-subtle">Aucune</p>
                ) : (
                  grantedPermissions.map(([perm]) => (
                    <div key={perm} className="px-2 py-1 text-ink">{PERMISSION_LABELS[perm] || perm}</div>
                  ))
                )}
                {Object.keys(ds.permissions || {}).length > 0 && (
                  <button 
                    type="button"
                    aria-label="Réinitialiser les permissions"
                    onClick={resetPermissions} 
                    className="w-full flex items-center gap-1.5 mt-1 px-2 py-1.5 rounded-lg hover:bg-surface-3 text-muted hover:text-white transition-colors"
                  >
                    <RotateCcw size={11} /> Réinitialiser les permissions
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
