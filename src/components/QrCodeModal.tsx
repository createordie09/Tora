import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, QrCode as QrIcon } from 'lucide-react';
import { popIn } from '../lib/motion';
import { useModalA11y } from '../hooks/useModalA11y';

interface QrCodeModalProps {
  data: { dataUrl: string; url: string } | null;
  onClose: () => void;
}

export default function QrCodeModal({ data, onClose }: QrCodeModalProps) {
  const [copied, setCopied] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, !!data, onClose);

  if (!data) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(data.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
        <motion.div
          {...popIn}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qrcode-modal-title"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-surface-1/95 border border-white/10 rounded-2xl shadow-2xl p-6 text-ink backdrop-blur-2xl flex flex-col items-center text-center relative"
        >
          <button
            type="button"
            aria-label="Fermer le code QR"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-muted hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>

          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3" aria-hidden="true">
            <QrIcon size={20} />
          </div>

          <h2 id="qrcode-modal-title" className="text-[16px] font-semibold text-white mb-1">Code QR de la page</h2>
          <p className="text-[12px] text-muted mb-4">Scannez pour ouvrir cette page sur votre smartphone</p>

          <div className="p-3 bg-white rounded-xl shadow-inner mb-4">
            <img src={data.dataUrl} alt={`Code QR menant vers ${data.url}`} className="w-48 h-48 block" />
          </div>

          <div className="w-full flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-xl text-[12px]">
            <span className="truncate flex-1 text-left text-muted px-1 font-mono text-[12px]">{data.url}</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copier l'adresse de la page"
              className="p-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white transition-colors shrink-0 flex items-center gap-1 text-[12px]"
              title="Copier le lien"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span role="status">{copied ? 'Copié' : 'Copier'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
