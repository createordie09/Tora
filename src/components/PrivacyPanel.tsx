import { useRef } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { TabData, ToraSettings } from '../types';
import { getProtectionScore } from '../lib/protection';
import { useModalA11y } from '../hooks/useModalA11y';
import { popIn } from '../lib/motion';
import Switch from './Switch';

interface PrivacyPanelProps {
  tab?: TabData;
  settings?: ToraSettings;
  domain: string;
  onClose: () => void;
}

const TONE_CLASS = {
  good: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30',
  ok: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
  weak: 'text-red-300 bg-red-500/10 border-red-400/30',
} as const;

export default function PrivacyPanel({ tab, settings, domain, onClose }: PrivacyPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(ref, true, onClose);

  const score = getProtectionScore(settings);
  const rows = [
    { label: 'Publicités et traqueurs', value: tab?.blockedCount ?? 0 },
    { label: 'Fenêtres popup', value: tab?.popupsBlockedCount ?? 0 },
    { label: 'Redirections automatiques', value: tab?.redirectsBlockedCount ?? 0 },
    { label: 'Fausses alertes', value: tab?.scarewareBlockedCount ?? 0 },
    { label: 'Cookies tiers', value: tab?.thirdPartyCookiesBlocked ?? 0 },
    { label: 'Paramètres de suivi retirés', value: tab?.trackingParamsRemoved ?? 0 },
  ];
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <motion.div
        {...popIn}
        ref={ref}
        role="dialog"
        aria-label="Protections de Tora sur ce site"
        style={{ originX: 0, originY: 0 }}
        className="absolute top-full mt-2 left-0 w-80 z-50 bg-[#121216] border border-[#5A5A5A] rounded-2xl shadow-2xl overflow-hidden text-[13px] text-ink"
      >
        <div className="px-4 pt-4 pb-3 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white">{total > 0 ? `${total.toLocaleString('fr-FR')} élément${total > 1 ? 's' : ''} bloqué${total > 1 ? 's' : ''}` : 'Aucun élément bloqué'}</p>
                <p className="text-[12px] text-muted truncate">{domain ? `sur ${domain}` : 'sur cette page'}</p>
              </div>
            </div>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full border text-[12px] font-medium ${TONE_CLASS[score.tone]}`}
              title={`${score.active} protections actives sur ${score.total}`}
            >
              {score.label}
            </span>
          </div>
        </div>

        <ul className="px-4 py-3 space-y-1.5">
          {rows.map(row => (
            <li key={row.label} className="flex items-center justify-between">
              <span className="text-muted">{row.label}</span>
              <span className={row.value > 0 ? 'font-semibold text-indigo-300' : 'text-subtle'}>{row.value.toLocaleString('fr-FR')}</span>
            </li>
          ))}
        </ul>

        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
          <span className="text-ink">Bloqueur de publicités</span>
          <Switch
            checked={!!settings?.isAdBlockEnabled}
            onChange={(checked) => window.tora?.updateSettings({ isAdBlockEnabled: checked })}
            ariaLabel="Bloqueur de publicités"
          />
        </div>

        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => { window.tora?.createTab('tora://extensions'); onClose(); }}
            className="w-full h-9 rounded-lg bg-[#1E1E1E] hover:bg-[#282828] border border-[#5A5A5A] text-[12px] font-medium text-muted hover:text-white transition-colors"
          >
            Gérer toutes les protections
          </button>
        </div>
      </motion.div>
    </>
  );
}
