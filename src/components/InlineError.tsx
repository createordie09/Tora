import { AlertCircle } from 'lucide-react';

export default function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-20 text-center">
      <AlertCircle size={32} className="mb-4 text-red-400/80" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-[13px] font-medium text-ink">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 text-[12px] font-medium px-4 py-2 bg-[#161616] hover:bg-[#222] rounded-lg border border-[#5A5A5A] text-muted hover:text-white transition-colors"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
