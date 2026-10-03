import { AlertCircle } from 'lucide-react';
import Button from './Button';

export default function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-20 text-center">
      <AlertCircle size={32} className="mb-4 text-red-400/80" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-[13px] font-medium text-ink">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-4">Réessayer</Button>
      )}
    </div>
  );
}
