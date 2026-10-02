import { Minus, Square, Copy, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!window.tora?.onWindowMaximizedChange) return;
    return window.tora.onWindowMaximizedChange(setIsMaximized);
  }, []);

  return (
    <div className="flex items-center h-full app-region-no-drag shrink-0">
      <button
        type="button"
        onClick={() => window.tora?.minimizeWindow()}
        className="h-8 w-10 flex items-center justify-center text-muted hover:bg-[#222] hover:text-ink transition-colors"
        aria-label="Réduire"
        title="Réduire"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        onClick={() => window.tora?.maximizeWindow()}
        className="h-8 w-10 flex items-center justify-center text-muted hover:bg-[#222] hover:text-ink transition-colors"
        aria-label={isMaximized ? 'Restaurer' : 'Agrandir'}
        title={isMaximized ? 'Restaurer' : 'Agrandir'}
      >
        {isMaximized ? <Copy size={12} /> : <Square size={12} />}
      </button>
      <button
        type="button"
        onClick={() => window.tora?.closeWindow()}
        className="h-8 w-10 flex items-center justify-center text-muted hover:bg-red-500 hover:text-white transition-colors"
        aria-label="Fermer"
        title="Fermer"
      >
        <X size={14} />
      </button>
    </div>
  );
}
