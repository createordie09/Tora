import { useRef, useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { X, Eye, EyeOff, Wand2 } from 'lucide-react';
import { CredentialEntry } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { fadeIn, scaleIn } from '../lib/motion';
import PasswordGenerator from './PasswordGenerator';

interface PasswordEditModalProps {
  credential: CredentialEntry;
  onClose: () => void;
  onSaved: (credentials: CredentialEntry[]) => void;
}

export default function PasswordEditModal({ credential, onClose, onSaved }: PasswordEditModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const [username, setUsername] = useState(credential.username);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = username.trim() !== credential.username || password !== '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!changed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.tora?.updateCredential(credential.id, {
        username: username.trim(),
        password: password || undefined,
      });
      if (result?.ok && result.credentials) {
        onSaved(result.credentials);
        onClose();
      } else {
        setError(result?.error || "Impossible d'enregistrer les modifications.");
      }
    } catch {
      setError("Impossible d'enregistrer les modifications.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div {...fadeIn} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 app-region-no-drag" onClick={onClose}>
      <motion.div
        {...scaleIn}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-credential-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-1 border border-line rounded-2xl shadow-2xl w-[420px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-48px)] overflow-y-auto p-6"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 id="edit-credential-title" className="text-[15px] font-semibold text-white">Modifier l'identifiant</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-muted hover:text-white p-1.5 rounded hover:bg-surface-3"><X size={16} /></button>
        </div>
        <p className="text-[12px] text-muted mb-4 truncate">{credential.domain}</p>

        <form onSubmit={submit}>
          <label htmlFor="edit-username" className="block text-[12px] font-medium text-ink mb-1.5">Identifiant</label>
          <input
            id="edit-username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(null); }}
            autoComplete="off"
            className="w-full h-10 px-3 bg-surface-0 border border-line-strong rounded-lg text-[13px] text-ink mb-3"
          />

          <label htmlFor="edit-password" className="block text-[12px] font-medium text-ink mb-1.5">Nouveau mot de passe</label>
          <div className="flex items-center gap-2 mb-1">
            <input
              id="edit-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Laisser vide pour conserver l'actuel"
              autoComplete="new-password"
              aria-describedby="edit-password-hint"
              className="flex-1 min-w-0 h-10 px-3 bg-surface-0 border border-line-strong rounded-lg text-[13px] text-ink placeholder-subtle"
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} className="h-10 w-10 flex items-center justify-center rounded-lg border border-line-strong text-muted hover:text-white hover:bg-white/5 transition-colors shrink-0">
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p id="edit-password-hint" className="text-[12px] text-subtle mb-3">Le mot de passe actuel n'est pas affiché ici.</p>

          <button
            type="button"
            onClick={() => setShowGenerator(v => !v)}
            aria-expanded={showGenerator}
            className="flex items-center gap-1.5 text-[12px] font-medium text-indigo-300 hover:text-indigo-200 mb-3 transition-colors"
          >
            <Wand2 size={13} aria-hidden="true" /> Générer un mot de passe fort
          </button>
          {showGenerator && (
            <div className="mb-4 p-4 rounded-xl bg-surface-1 border border-white/10">
              <PasswordGenerator
                useLabel="Utiliser ce mot de passe"
                onUse={(generated) => { setPassword(generated); setShowPassword(true); setShowGenerator(false); }}
              />
            </div>
          )}

          {error && <p role="alert" className="text-[12px] text-red-400 mb-3">{error}</p>}

          <div className="flex items-center gap-2">
            <button type="submit" disabled={!changed || busy || !username.trim()} className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-[13px] font-medium text-white transition-colors">
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-[13px] text-muted hover:text-white hover:bg-white/5 transition-colors">
              Annuler
            </button>
          </div>
          <p className="text-[12px] text-subtle mt-3">Cela ne change que ce qui est enregistré dans Tora, pas le mot de passe de votre compte sur le site.</p>
        </form>
      </motion.div>
    </motion.div>
  );
}
