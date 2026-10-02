import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { OVERLAY_TOP } from '../lib/layout';
import { slideDown } from '../lib/motion';

interface RedirectBannerProps {
  bannerInfo: { tabId: string, type: 'redirect' | 'loop' | 'popup', url?: string } | null;
  onDismiss: () => void;
  onAllow: () => void;
  isVerticalTabsEnabled?: boolean;
}

export default function RedirectBanner({ bannerInfo, onDismiss, onAllow, isVerticalTabsEnabled }: RedirectBannerProps) {
  let message = '';
  let showAllow = false;
  let allowText = '';

  if (bannerInfo?.type === 'redirect') {
    message = 'Tora a bloqué une redirection automatique.';
    showAllow = true;
    allowText = 'Autoriser quand même';
  } else if (bannerInfo?.type === 'loop') {
    message = 'Ce site tente de vous rediriger plusieurs fois. Navigation temporairement bloquée.';
  } else if (bannerInfo?.type === 'popup') {
    message = 'Un popup a été bloqué.';
    showAllow = true;
    allowText = 'Autoriser temporairement (3s)';
  }

  return (
    <div className={`absolute left-0 right-0 z-50 flex justify-center pointer-events-none app-region-no-drag transition-all duration-200`} style={{ top: isVerticalTabsEnabled ? OVERLAY_TOP.vertical : OVERLAY_TOP.horizontal }}>
      <AnimatePresence>
        {bannerInfo && (
          <motion.div
            key={`${bannerInfo.tabId}-${bannerInfo.type}-${bannerInfo.url || ''}`}
            {...slideDown}
            role="alert"
            className="bg-[#1E1E1E]/95 border border-[#3A3A3A] shadow-[0_8px_30px_rgb(0,0,0,0.5)] rounded-xl px-4 py-3 flex items-center space-x-3.5 pointer-events-auto max-w-xl text-[13px] text-ink backdrop-blur-xl"
          >
            <AlertTriangle size={18} className="text-[#FFBD2E] shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{message}</span>
            {showAllow && (
              <button 
                type="button"
                onClick={onAllow} 
                className="px-3.5 py-1.5 bg-[#2A2A2A] hover:bg-[#333] rounded-lg text-white transition-colors whitespace-nowrap border border-[#3A3A3A] text-[12px]"
              >
                {allowText}
              </button>
            )}
            <button 
              type="button"
              aria-label="Fermer l'alerte"
              title="Fermer"
              onClick={onDismiss} 
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
