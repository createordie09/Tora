import { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Copy } from 'lucide-react';
import { useToast } from './Toast';

export interface GeneratorOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
}

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz', // no "l" (looks like 1)
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // no "I" / "O"
  digits: '23456789', // no 0 / 1
  symbols: '!@#$%^&*-_=+?',
} as const;

function randomIndex(max: number): number {
  // Rejection sampling: no modulo bias.
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}

export function generatePassword(options: GeneratorOptions): string {
  const active = (Object.keys(SETS) as (keyof typeof SETS)[]).filter(k => options[k]);
  const sets = active.length > 0 ? active : (['lower'] as (keyof typeof SETS)[]);
  const pool = sets.map(k => SETS[k]).join('');
  const length = Math.max(8, Math.min(64, options.length));
  // Guarantee at least one character of every selected kind, then fill from the whole pool.
  const chars = sets.map(k => SETS[k][randomIndex(SETS[k].length)]);
  while (chars.length < length) chars.push(pool[randomIndex(pool.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface PasswordGeneratorProps {
  onUse?: (password: string) => void;
  useLabel?: string;
}

export default function PasswordGenerator({ onUse, useLabel = 'Utiliser ce mot de passe' }: PasswordGeneratorProps) {
  const { showToast } = useToast();
  const [options, setOptions] = useState<GeneratorOptions>({ length: 20, lower: true, upper: true, digits: true, symbols: true });
  const [password, setPassword] = useState('');

  const regenerate = useCallback(() => setPassword(generatePassword(options)), [options]);
  useEffect(() => { regenerate(); }, [regenerate]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      showToast('Mot de passe copié', 'success');
    } catch {
      showToast('Copie impossible', 'error');
    }
  };

  const toggle = (key: 'lower' | 'upper' | 'digits' | 'symbols') => {
    setOptions(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // keep at least one kind of character selected
      return next.lower || next.upper || next.digits || next.symbols ? next : prev;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <output
          aria-label="Mot de passe généré"
          className="flex-1 min-w-0 h-10 px-3 flex items-center bg-surface-0 border border-line-strong rounded-lg font-mono text-[13px] text-ink break-all overflow-hidden"
        >
          {password}
        </output>
        <button type="button" onClick={regenerate} aria-label="Générer un autre mot de passe" title="Régénérer" className="h-10 w-10 flex items-center justify-center rounded-lg border border-line-strong text-muted hover:text-white hover:bg-white/5 transition-colors shrink-0">
          <RefreshCw size={15} />
        </button>
        <button type="button" onClick={copy} aria-label="Copier le mot de passe généré" title="Copier" className="h-10 w-10 flex items-center justify-center rounded-lg border border-line-strong text-muted hover:text-white hover:bg-white/5 transition-colors shrink-0">
          <Copy size={15} />
        </button>
      </div>

      <div>
        <label htmlFor="gen-length" className="flex items-center justify-between text-[12px] text-muted mb-1.5">
          <span>Longueur</span>
          <span className="font-mono text-ink">{options.length}</span>
        </label>
        <input
          id="gen-length"
          type="range"
          min={8}
          max={64}
          value={options.length}
          onChange={(e) => setOptions(prev => ({ ...prev, length: Number(e.target.value) }))}
          className="w-full accent-indigo-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[13px] text-ink">
        {([
          ['lower', 'Minuscules'],
          ['upper', 'Majuscules'],
          ['digits', 'Chiffres'],
          ['symbols', 'Symboles'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} className="accent-indigo-500" />
            {label}
          </label>
        ))}
      </div>

      {onUse && (
        <button
          type="button"
          onClick={() => onUse(password)}
          className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[13px] font-medium text-white transition-colors"
        >
          {useLabel}
        </button>
      )}
    </div>
  );
}
