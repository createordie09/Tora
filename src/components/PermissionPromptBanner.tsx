import { useEffect, useState } from 'react';
import { ShieldQuestion, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { PermissionPrompt } from '../types';
import { OVERLAY_TOP } from '../lib/layout';
import { slideDown } from '../lib/motion';

const PERMISSION_LABELS: Record<string, string> = {
  media: 'utiliser votre caméra/micro',
  camera: 'utiliser votre caméra',
  microphone: 'utiliser votre micro',
  notifications: 'vous envoyer des notifications',
  geolocation: 'connaître votre position',
  midi: 'accéder à vos périphériques MIDI',
  midiSysex: 'accéder à vos périphériques MIDI',
  'clipboard-read': 'lire le presse-papiers',
  'clipboard-sanitized-write': 'écrire dans le presse-papiers',
};

interface PermissionPromptBannerProps {
  prompt: PermissionPrompt | null;
  onDismiss: () => void;
  isVerticalTabsEnabled?: boolean;
}

export default function PermissionPromptBanner({ prompt, onDismiss, isVerticalTabsEnabled }: PermissionPromptBannerProps) {
  const [remember, setRemember] = useState(false);

  // A new request never inherits the previous request's "always" choice.
  useEffect(() => { setRemember(false); }, [prompt?.pendingId]);

  const respond = (granted: boolean) => {
    if (!prompt) return;
    window.tora?.respondPermission(prompt.pendingId, granted, remember);
    if (remember) window.tora?.rememberPermission(prompt.domain, prompt.permission, granted ? 'granted' : 'denied');
    onDismiss();
  };

  const handleDismiss = () => {
    if (prompt) {
      window.tora?.respondPermission(prompt.pendingId, false, false);
    }
    onDismiss();
  };

  const label = prompt ? (PERMISSION_LABELS[prompt.permission] || `accéder à "${prompt.permission}"`) : '';

  return (
    <div className={`absolute left-0 right-0 z-50 flex justify-center pointer-events-none app-region-no-drag`} style={{ top: isVerticalTabsEnabled ? OVERLAY_TOP.vertical : OVERLAY_TOP.horizontal }}>
      <AnimatePresence>
        {prompt && (
          <motion.div
            key={prompt.pendingId}
            {...slideDown}
            role="alertdialog"
            aria-live="polite"
            className="bg-surface-2/95 mx-4 border border-line shadow-[0_8px_30px_rgb(0,0,0,0.5)] rounded-xl px-4 py-3 flex items-center space-x-3.5 pointer-events-auto max-w-xl text-[13px] text-ink backdrop-blur-xl"
          >
            <ShieldQuestion size={18} className="text-indigo-400 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              <strong className="font-semibold text-white">{prompt.domain}</strong> souhaite {label}.
            </span>
            <label className="flex items-center gap-1.5 text-[12px] text-muted whitespace-nowrap cursor-pointer hover:text-white transition-colors">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-indigo-500 rounded" />
              Toujours pour ce site
            </label>
            <button
              type="button"
              onClick={() => respond(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors whitespace-nowrap shadow-sm text-[12px]"
            >
              Autoriser
            </button>
            <button
              type="button"
              onClick={() => respond(false)}
              className="px-3.5 py-1.5 bg-surface-3 hover:bg-surface-3 rounded-lg text-ink hover:text-white transition-colors whitespace-nowrap border border-line text-[12px]"
            >
              Refuser
            </button>
            <button 
              type="button"
              aria-label="Fermer la notification"
              title="Fermer"
              onClick={handleDismiss} 
              className="text-muted hover:text-ink hover:bg-white/5 rounded-md transition-colors shrink-0 p-1.5"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
