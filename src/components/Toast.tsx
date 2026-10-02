import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { slideUp } from '../lib/motion';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

export interface ToastOptions {
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info', options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const removeToast = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const startTimer = useCallback((id: string, duration: number) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  const pauseTimer = (id: string) => clearTimeout(timers.current[id]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', options?: ToastOptions) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-3), { id, message, type, action: options?.action }]); // Keep at most 4 toasts
    startTimer(id, options?.duration ?? (options?.action ? 6000 : 3200));
  }, [startTimer]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div 
                className="fixed bottom-20 right-6 z-[100] flex flex-col gap-2 pointer-events-none app-region-no-drag"
      >
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              {...slideUp}
              role={toast.type === 'error' ? 'alert' : 'status'}
              onMouseEnter={() => pauseTimer(toast.id)}
              onMouseLeave={() => startTimer(toast.id, 2000)}
              onFocus={() => pauseTimer(toast.id)}
              onBlur={() => startTimer(toast.id, 2000)}
              className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl bg-[#18181B]/95 border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl text-[13px] text-ink max-w-sm"
            >
              {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle size={16} className="text-red-400 shrink-0" />}
              {toast.type === 'info' && <Info size={16} className="text-indigo-400 shrink-0" />}
              
              <span className="flex-1 font-medium">{toast.message}</span>

              {toast.action && (
                <button
                  type="button"
                  onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
                  className="text-[12px] font-semibold text-indigo-300 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                >
                  {toast.action.label}
                </button>
              )}
              
              <button
                type="button"
                aria-label="Fermer la notification"
                onClick={() => removeToast(toast.id)}
                className="text-muted hover:text-white p-1.5 rounded transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
