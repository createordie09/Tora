import { useState, useEffect, useMemo, useRef, FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CredentialEntry } from '../types';
import { Trash2, KeyRound, Copy, Eye, EyeOff, Search, Download, Upload, X, Pencil, Wand2, ShieldCheck, Loader2 } from 'lucide-react';
import Favicon from './Favicon';
import InlineError from './InlineError';
import PasswordGenerator from './PasswordGenerator';
import PasswordEditModal from './PasswordEditModal';
import { useToast } from './Toast';
import { useModalA11y } from '../hooks/useModalA11y';
import { useUndoableDelete } from '../hooks/useUndoableDelete';
import { fadeIn, scaleIn } from '../lib/motion';

export default function PasswordsPage() {
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [vaultMode, setVaultMode] = useState<'export' | 'import' | null>(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [vaultMessage, setVaultMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const undoableDelete = useUndoableDelete();
  const revealTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [editing, setEditing] = useState<CredentialEntry | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const generatorRef = useRef<HTMLDivElement>(null);
  const [health, setHealth] = useState<Record<string, { weak: boolean; reused: boolean }>>({});
  const [breaches, setBreaches] = useState<Record<string, number>>({});
  const [breachPanelOpen, setBreachPanelOpen] = useState(false);
  const [breachProgress, setBreachProgress] = useState<{ done: number; total: number } | null>(null);
  const [breachError, setBreachError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.resolve(window.tora?.getCredentials())
      .then(res => setCredentials(res || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    Promise.resolve(window.tora?.getPasswordHealth()).then(h => setHealth(h || {})).catch(() => {});
  };

  const refreshHealth = () => {
    Promise.resolve(window.tora?.getPasswordHealth()).then(h => setHealth(h || {})).catch(() => {});
  };

  const runBreachCheck = async () => {
    if (breachProgress || credentials.length === 0) return;
    setBreachError(null);
    setBreaches({});
    setBreachProgress({ done: 0, total: credentials.length });
    const found: Record<string, number> = {};
    try {
      for (let i = 0; i < credentials.length; i++) {
        const result = await window.tora?.checkPasswordBreach(credentials[i].id);
        if (!result?.ok) {
          setBreachError(result?.error || 'La vérification a échoué.');
          break;
        }
        found[credentials[i].id] = result.count ?? 0;
        setBreaches({ ...found });
        setBreachProgress({ done: i + 1, total: credentials.length });
      }
    } catch {
      setBreachError('La vérification a échoué.');
    } finally {
      const compromised = Object.values(found).filter(n => n > 0).length;
      setBreachProgress(null);
      if (Object.keys(found).length === credentials.length) {
        showToast(compromised > 0 ? `${compromised} mot(s) de passe trouvé(s) dans des fuites de données` : 'Aucun mot de passe trouvé dans des fuites connues', compromised > 0 ? 'error' : 'success');
      }
    }
  };

  useEffect(() => {
    load();
    const timers = revealTimers.current;
    return () => {
      setRevealed({});
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return credentials;
    return credentials.filter(c => c.domain.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
  }, [credentials, query]);

  const grouped = useMemo(() => {
    return filtered.reduce((acc, c) => {
      if (!acc[c.domain]) acc[c.domain] = [];
      acc[c.domain].push(c);
      return acc;
    }, {} as Record<string, CredentialEntry[]>);
  }, [filtered]);

  const hide = (id: string) => {
    clearTimeout(revealTimers.current[id]);
    delete revealTimers.current[id];
    setRevealed(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Like the other lists: removed at once, with an "Annuler" window before it is really deleted.
  const handleDelete = (c: CredentialEntry) => {
    hide(c.id);
    undoableDelete(
      `credential:${c.id}`,
      `Identifiant « ${c.username} » supprimé`,
      () => setCredentials(prev => prev.filter(x => x.id !== c.id)),
      () => setCredentials(prev => [...prev, c]),
      () => { window.tora?.deleteCredential(c.id).then(refreshHealth).catch(() => {}); },
    );
  };

  const toggleReveal = async (id: string) => {
    if (revealed[id]) { hide(id); return; }
    const password = await window.tora?.revealCredentialPassword(id);
    if (password) {
      setRevealed(prev => ({ ...prev, [id]: password }));
      // A visible password hides itself again after 15 s.
      revealTimers.current[id] = setTimeout(() => hide(id), 15000);
    }
  };

  const closeVaultModal = () => {
    setVaultMode(null);
    setMasterPassword('');
    setConfirmPassword('');
    setVaultMessage(null);
  };

  useModalA11y(dialogRef, vaultMode !== null, closeVaultModal);
  useModalA11y(generatorRef, generatorOpen, () => setGeneratorOpen(false));

  const tooShort = vaultMode === 'export' && masterPassword.length > 0 && masterPassword.length < 8;
  const mismatch = vaultMode === 'export' && confirmPassword.length > 0 && confirmPassword !== masterPassword;
  const canSubmit = !vaultBusy && masterPassword.length > 0 && (vaultMode !== 'export' || (masterPassword.length >= 8 && confirmPassword === masterPassword));

  const handleVaultSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!vaultMode || !canSubmit) return;
    setVaultBusy(true);
    setVaultMessage(null);
    try {
      if (vaultMode === 'export') {
        const result = await window.tora?.exportCredentials(masterPassword);
        if (result?.ok) {
          setVaultMessage({ ok: true, text: `${result.count} identifiant(s) exporté(s) avec succès.` });
        } else {
          setVaultMessage({ ok: false, text: result?.error || "Échec de l'export." });
        }
      } else {
        const result = await window.tora?.importCredentials(masterPassword);
        if (result?.ok) {
          setVaultMessage({ ok: true, text: `${result.added} ajouté(s), ${result.updated} mis à jour.` });
          window.tora?.getCredentials().then(setCredentials);
        } else {
          setVaultMessage({ ok: false, text: result?.error || "Échec de l'import." });
        }
      }
    } catch {
      setVaultMessage({ ok: false, text: "Une erreur est survenue. Réessayez." });
    } finally {
      setVaultBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-surface-0">
      <div className="max-w-5xl mx-auto px-10 py-16">
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-[28px] font-semibold text-white font-display">Mots de passe</h1>
          <div className="flex items-center space-x-2 mt-1.5">
            <button type="button" onClick={() => setGeneratorOpen(true)} title="Générer un mot de passe fort" className="flex items-center space-x-1.5 text-[12px] font-medium px-3 py-2 bg-surface-1 hover:bg-surface-2 rounded-lg border border-line-strong transition-colors text-muted hover:text-white">
              <Wand2 size={12} aria-hidden="true" /><span>Générateur</span>
            </button>
            <button type="button" onClick={() => setVaultMode('export')} title="Exporter le coffre (fichier chiffré)" className="flex items-center space-x-1.5 text-[12px] font-medium px-3 py-2 bg-surface-1 hover:bg-surface-2 rounded-lg border border-line-strong transition-colors text-muted hover:text-white">
              <Download size={12} aria-hidden="true" /><span>Exporter</span>
            </button>
            <button type="button" onClick={() => setVaultMode('import')} title="Importer un coffre" className="flex items-center space-x-1.5 text-[12px] font-medium px-3 py-2 bg-surface-1 hover:bg-surface-2 rounded-lg border border-line-strong transition-colors text-muted hover:text-white">
              <Upload size={12} aria-hidden="true" /><span>Importer</span>
            </button>
          </div>
        </div>
        <p className="text-[13px] text-muted mb-6">Identifiants enregistrés, chiffrés localement</p>

        {credentials.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-surface-1 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <ShieldCheck size={18} className="text-indigo-400 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="text-[13px]">
                  <p className="font-medium text-ink">Santé des mots de passe</p>
                  <p className="text-muted" role="status">
                    {(Object.values(health).filter(h => h.weak).length) + (Object.values(health).filter(h => h.reused).length) === 0
                      ? 'Aucun mot de passe faible ou réutilisé.'
                      : `${Object.values(health).filter(h => h.weak).length} faible(s), ${Object.values(health).filter(h => h.reused).length} réutilisé(s).`}
                    {Object.values(breaches).some(n => n > 0) && ` ${Object.values(breaches).filter(n => n > 0).length} compromis dans des fuites.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBreachPanelOpen(v => !v)}
                aria-expanded={breachPanelOpen}
                className="h-9 px-3 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 border border-line-strong rounded-lg text-muted hover:text-white transition-colors"
              >
                Vérifier les fuites de données
              </button>
            </div>
            {breachPanelOpen && (
              <div className="mt-4 pt-4 border-t border-white/10 text-[12px] text-muted leading-relaxed">
                <p>
                  La vérification utilise le service haveibeenpwned.com. Vos mots de passe ne quittent jamais votre ordinateur : seuls les 5 premiers caractères d'une empreinte chiffrée (SHA-1) de chacun sont envoyés, ce qui ne permet pas de les retrouver. Cela nécessite une connexion Internet.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <button
                    type="button"
                    onClick={runBreachCheck}
                    disabled={!!breachProgress}
                    className="h-9 px-4 flex items-center gap-2 text-[12px] font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-lg text-white transition-colors"
                  >
                    {breachProgress && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                    {breachProgress ? `Vérification… ${breachProgress.done}/${breachProgress.total}` : 'Lancer la vérification'}
                  </button>
                  {breachError && <span role="alert" className="text-red-400">{breachError}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        <AnimatePresence>
          {vaultMode && (
            <motion.div
              {...fadeIn}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 app-region-no-drag"
              onClick={closeVaultModal}
            >
              <motion.div
                {...scaleIn}
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="vault-modal-title"
                className="bg-surface-1 border border-line rounded-2xl shadow-2xl w-[380px] max-w-[calc(100vw-32px)] p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 id="vault-modal-title" className="text-[15px] font-semibold text-white">
                    {vaultMode === 'export' ? 'Exporter le coffre' : 'Importer un coffre'}
                  </h2>
                  <button type="button" onClick={closeVaultModal} aria-label="Fermer la boîte de dialogue" className="text-muted hover:text-white p-1.5 rounded hover:bg-surface-3"><X size={16} /></button>
                </div>
                <p className="text-[12px] text-muted mb-4 leading-relaxed">
                  {vaultMode === 'export'
                    ? "Choisissez un mot de passe maître pour chiffrer le fichier exporté. Il vous sera demandé pour le réimporter — Tora ne le stocke nulle part."
                    : "Entrez le mot de passe maître utilisé lors de l'export de ce coffre."}
                </p>
                <form onSubmit={handleVaultSubmit}>
                  <label htmlFor="vault-master" className="block text-[12px] font-medium text-ink mb-1.5">Mot de passe maître</label>
                  <input
                    id="vault-master"
                    type="password"
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    autoComplete={vaultMode === 'export' ? 'new-password' : 'current-password'}
                    aria-invalid={tooShort || undefined}
                    aria-describedby={tooShort ? 'vault-master-error' : undefined}
                    className="w-full h-10 px-3 bg-surface-0 border border-line-strong rounded-lg text-[13px] text-ink"
                  />
                  {tooShort && <p id="vault-master-error" className="text-[12px] text-red-400 mt-1.5">Utilisez au moins 8 caractères.</p>}

                  {vaultMode === 'export' && (
                    <>
                      <label htmlFor="vault-confirm" className="block text-[12px] font-medium text-ink mt-3 mb-1.5">Confirmer le mot de passe</label>
                      <input
                        id="vault-confirm"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        aria-invalid={mismatch || undefined}
                        aria-describedby={mismatch ? 'vault-confirm-error' : undefined}
                        className="w-full h-10 px-3 bg-surface-0 border border-line-strong rounded-lg text-[13px] text-ink"
                      />
                      {mismatch && <p id="vault-confirm-error" className="text-[12px] text-red-400 mt-1.5">Les mots de passe ne correspondent pas.</p>}
                    </>
                  )}

                  <div className="mt-4">
                    {vaultMessage && (
                      <p role={vaultMessage.ok ? 'status' : 'alert'} className={`text-[12px] mb-4 ${vaultMessage.ok ? 'text-emerald-400' : 'text-red-400'}`}>{vaultMessage.text}</p>
                    )}
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-[13px] font-medium text-white transition-colors"
                    >
                      {vaultBusy ? 'Traitement…' : vaultMode === 'export' ? 'Exporter et choisir où enregistrer' : 'Importer et choisir le fichier'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {generatorOpen && (
            <motion.div {...fadeIn} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 app-region-no-drag" onClick={() => setGeneratorOpen(false)}>
              <motion.div
                {...scaleIn}
                ref={generatorRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="generator-title"
                onClick={(e) => e.stopPropagation()}
                className="bg-surface-1 border border-line rounded-2xl shadow-2xl w-[400px] max-w-[calc(100vw-32px)] p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 id="generator-title" className="text-[15px] font-semibold text-white">Générateur de mot de passe</h2>
                  <button type="button" onClick={() => setGeneratorOpen(false)} aria-label="Fermer" className="text-muted hover:text-white p-1.5 rounded hover:bg-surface-3"><X size={16} /></button>
                </div>
                <PasswordGenerator />
              </motion.div>
            </motion.div>
          )}
          {editing && (
            <PasswordEditModal
              credential={editing}
              onClose={() => setEditing(null)}
              onSaved={(updated) => { setCredentials(updated); setRevealed({}); refreshHealth(); showToast('Identifiant mis à jour'); }}
            />
          )}
        </AnimatePresence>

        <div className="flex items-center h-10 px-3 mb-8 bg-surface-1 border border-line-strong rounded-xl focus-ring-within">
          <Search size={14} className="text-muted mr-2 shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un site ou identifiant"
            aria-label="Rechercher un site ou identifiant"
            className="w-full bg-transparent text-[13px] text-ink placeholder-subtle outline-none"
          />
        </div>

        {loading ? (
          <div role="status" aria-label="Chargement des mots de passe…" className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {[0, 1, 2].map(i => <div key={i} className="h-[110px] rounded-xl bg-surface-1 border border-line animate-pulse" aria-hidden="true" />)}
          </div>
        ) : error ? (
          <InlineError message="Impossible de charger les mots de passe." onRetry={load} />
        ) : (
          <div className="space-y-8">
            {Object.keys(grouped).map(domain => (
              <div key={domain}>
                <h2 className="text-[12px] text-muted mb-3 font-semibold uppercase tracking-wider truncate">{domain}</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {grouped[domain].map(c => (
                    <div key={c.id} className="group relative flex flex-col p-3.5 rounded-xl bg-surface-1 border border-line hover:border-line hover:bg-surface-1 focus-within:border-line transition-colors">
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        title="Supprimer"
                        aria-label={`Supprimer l'identifiant ${c.username} sur ${c.domain}`}
                        className="absolute top-2 right-2 p-1.5 rounded-md transition-colors text-muted hover:bg-surface-3 hover:text-red-400"
                      >
                        <Trash2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        title="Modifier"
                        aria-label={`Modifier l'identifiant ${c.username} sur ${c.domain}`}
                        className="absolute top-2 right-9 p-1.5 rounded-md transition-colors text-muted hover:bg-surface-3 hover:text-white"
                      >
                        <Pencil size={12} />
                      </button>

                      <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center mb-2.5 shrink-0">
                        <Favicon src={c.favicon} size={15} />
                      </div>

                      <button
                        type="button"
                        onClick={() => { window.tora?.copyCredentialUsername(c.username); showToast('Identifiant copié'); }}
                        title="Cliquer pour copier l'identifiant"
                        aria-label={`Copier l'identifiant ${c.username} (${c.domain})`}
                        className="text-[12px] text-ink font-medium truncate text-left hover:text-indigo-400 transition-colors pr-14 py-1"
                      >
                        {c.username}
                      </button>

                      {(health[c.id]?.weak || health[c.id]?.reused || (breaches[c.id] ?? 0) > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(breaches[c.id] ?? 0) > 0 && <span className="px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-[12px] text-red-300">Compromis ({breaches[c.id].toLocaleString('fr-FR')} fuites)</span>}
                          {health[c.id]?.weak && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[12px] text-amber-300">Faible</span>}
                          {health[c.id]?.reused && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[12px] text-amber-300">Réutilisé</span>}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-line">
                        <span className="text-[12px] font-mono text-muted truncate py-1">
                          {revealed[c.id] ? revealed[c.id] : '••••••••••'}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleReveal(c.id)}
                            title={revealed[c.id] ? 'Masquer' : 'Afficher'}
                            aria-label={`${revealed[c.id] ? 'Masquer' : 'Afficher'} le mot de passe de ${c.username} sur ${c.domain}`}
                            aria-pressed={!!revealed[c.id]}
                            className="p-1.5 rounded text-muted hover:bg-surface-3 hover:text-ink transition-colors"
                          >
                            {revealed[c.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => { window.tora?.copyCredentialPassword(c.id); showToast('Mot de passe copié (effacé après 30 s)'); }}
                            title="Copier le mot de passe (effacé après 30s)"
                            aria-label={`Copier le mot de passe de ${c.username} sur ${c.domain}`}
                            className="p-1.5 rounded text-muted hover:bg-surface-3 hover:text-indigo-400 transition-colors"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-subtle">
                <KeyRound size={32} className="mb-4 opacity-50" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-[13px] font-medium">
                  {credentials.length === 0 ? 'Aucun mot de passe enregistré' : 'Aucun résultat'}
                </p>
                {credentials.length === 0 && (
                  <p className="text-[12px] text-subtle mt-1 text-center max-w-[280px]">
                    Tora vous proposera d'enregistrer vos identifiants la prochaine fois que vous vous connecterez sur un site.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
