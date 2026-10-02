import { KeyRound, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CredentialPrompt } from '../types';
import { OVERLAY_TOP } from '../lib/layout';
import { slideDown } from '../lib/motion';

interface CredentialSaveBannerProps {
  prompt: CredentialPrompt | null;
  onSave: (pendingId: string) => void;
  onNeverForSite: (pendingId: string) => void;
  onDismiss: (pendingId: string) => void;
  isVerticalTabsEnabled?: boolean;
}

export default function CredentialSaveBanner({ prompt, onSave, onNeverForSite, onDismiss, isVerticalTabsEnabled }: CredentialSaveBannerProps) {
  const message = prompt && (prompt.kind === 'update'
    ? `Mettre à jour le mot de passe de ${prompt.username} sur ${prompt.domain} ?`
    : `Enregistrer le mot de passe de ${prompt.username} sur ${prompt.domain} ?`);

  return (
    <div className={`absolute left-0 right-0 z-50 flex justify-center pointer-events-none app-region-no-drag transition-all duration-200`} style={{ top: isVerticalTabsEnabled ? OVERLAY_TOP.vertical : OVERLAY_TOP.horizontal }}>
      <AnimatePresence>
        {prompt && (
          <motion.div
            key={prompt.pendingId}
            {...slideDown}
            role="alert"
            className="bg-[#1E1E1E]/95 border border-[#3A3A3A] shadow-[0_8px_30px_rgb(0,0,0,0.5)] rounded-xl px-4 py-3 flex items-center space-x-3.5 pointer-events-auto max-w-xl text-[13px] text-ink backdrop-blur-xl"
          >
            <KeyRound size={18} className="text-indigo-400 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{message}</span>
            <button
              type="button"
              onClick={() => onSave(prompt.pendingId)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors whitespace-nowrap shadow-sm text-[12px]"
            >
              {prompt.kind === 'update' ? 'Mettre à jour' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={() => onNeverForSite(prompt.pendingId)}
              className="px-3.5 py-1.5 bg-[#2A2A2A] hover:bg-[#333] rounded-lg text-ink hover:text-white transition-colors whitespace-nowrap border border-[#3A3A3A] text-[12px]"
            >
              Jamais pour ce site
            </button>
            <button 
              type="button"
              aria-label="Fermer la notification"
              title="Fermer"
              onClick={() => onDismiss(prompt.pendingId)} 
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
