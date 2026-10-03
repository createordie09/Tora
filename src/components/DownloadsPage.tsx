import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DownloadItem } from '../types';
import { Folder, FileCheck, AlertCircle, DownloadCloud, Loader2, Pause, Play, X, RotateCw, FileX } from 'lucide-react';
import Favicon from './Favicon';
import { popIn, cardHover, buttonPress } from '../lib/motion';
import CardGridSkeleton from './CardGridSkeleton';
import InlineError from './InlineError';
import { useUndoableDelete } from '../hooks/useUndoableDelete';
import Button from './Button';

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const iconButton = 'p-2 rounded text-muted hover:bg-white/10 hover:text-white transition-colors';

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const undoableDelete = useUndoableDelete();

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.resolve(window.tora?.getDownloads())
      .then(res => setDownloads(res || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const unsub = window.tora?.onDownloadsUpdated(setDownloads);
    return () => unsub?.();
  }, []);

  const visible = downloads.filter(d => !hidden.includes(d.id));
  const hasFinished = visible.some(d => d.state !== 'progressing');

  const removeFromList = (dl: DownloadItem) => {
    undoableDelete(
      `download:${dl.id}`,
      `« ${dl.filename} » retiré de la liste`,
      () => setHidden(prev => [...prev, dl.id]),
      () => setHidden(prev => prev.filter(id => id !== dl.id)),
      () => { window.tora?.removeDownload(dl.id); },
    );
  };

  const clearList = () => {
    const ids = visible.filter(d => d.state !== 'progressing').map(d => d.id);
    undoableDelete(
      'downloads:clear',
      `${ids.length} téléchargement${ids.length > 1 ? 's' : ''} retiré${ids.length > 1 ? 's' : ''} de la liste`,
      () => setHidden(prev => [...prev, ...ids]),
      () => setHidden(prev => prev.filter(id => !ids.includes(id))),
      () => { window.tora?.clearDownloads(); },
    );
  };

  return (
    <motion.div {...popIn} className="flex-1 overflow-y-auto bg-surface-0">
      <div className="max-w-5xl mx-auto px-10 py-16">
        <div className="flex items-start justify-between gap-4 mb-10">
          <div>
            <h1 className="text-[28px] font-semibold text-white mb-1 font-display">Téléchargements</h1>
            <p className="text-[13px] text-muted">Fichiers téléchargés depuis vos onglets</p>
          </div>
          {hasFinished && (
            <Button onClick={clearList} className="mt-2 shrink-0">Vider la liste</Button>
          )}
        </div>

        {loading ? (
          <CardGridSkeleton label="Chargement des téléchargements…" />
        ) : error ? (
          <InlineError message="Impossible de charger les téléchargements." onRetry={load} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            <AnimatePresence mode="popLayout">
              {visible.map(dl => {
                const inProgress = dl.state === 'progressing';
                const failed = dl.state === 'interrupted' || dl.state === 'cancelled';
                const canOpen = dl.state === 'completed' && !!dl.path && !dl.missing;
                const hasActions = inProgress || canOpen || (failed && dl.source === 'browser');
                const percent = dl.totalBytes > 0 ? Math.min(100, (dl.receivedBytes / dl.totalBytes) * 100) : 0;
                return (
                  <motion.div
                    key={dl.id}
                    layout
                    {...cardHover}
                    className="flex flex-col p-3.5 rounded-xl bg-surface-1 border border-white/5 hover:border-indigo-500/20 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="relative w-9 h-9 mb-2.5 shrink-0">
                        <div className="w-9 h-9 rounded-lg bg-surface-1 border border-line flex items-center justify-center">
                          <Favicon src={dl.favicon} size={15} />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface-1 border border-line flex items-center justify-center" role="img" aria-label={dl.state === 'completed' ? (dl.missing ? 'Fichier introuvable' : 'Terminé') : inProgress ? (dl.paused ? 'En pause' : 'En cours') : dl.state === 'cancelled' ? 'Annulé' : 'Échec du téléchargement'}>
                          {dl.state === 'completed' ? (dl.missing ? <FileX size={9} className="text-amber-400" /> : <FileCheck size={9} className="text-indigo-400" />) :
                           inProgress ? (dl.paused ? <Pause size={9} className="text-amber-400" /> : <Loader2 size={9} className="text-indigo-400 animate-spin" />) :
                           <AlertCircle size={9} className="text-red-400" aria-hidden="true" />}
                        </div>
                      </div>
                      {!inProgress && (
                        <button
                          type="button"
                          onClick={() => removeFromList(dl)}
                          aria-label={`Retirer ${dl.filename} de la liste`}
                          title="Retirer de la liste"
                          className={iconButton}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    <span className="text-[12px] text-ink font-medium truncate">{dl.filename}</span>
                    <span className="text-[12px] text-muted truncate mt-0.5">{dl.url}</span>

                    {inProgress && (
                      <>
                        <div
                          role="progressbar"
                          aria-label={`Progression de ${dl.filename}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(percent)}
                          className="w-full bg-surface-0 h-1 mt-2 rounded-full overflow-hidden border border-line"
                        >
                          <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-[12px] text-muted mt-1.5">
                          {formatBytes(dl.receivedBytes)}{dl.totalBytes > 0 ? ` / ${formatBytes(dl.totalBytes)}` : ''}
                          {dl.paused ? ' · en pause' : dl.speedBytesPerSec ? ` · ${formatBytes(dl.speedBytesPerSec)}/s` : ''}
                        </span>
                      </>
                    )}

                    {failed && (
                      <span className="text-[12px] text-red-400 mt-1.5">
                        {dl.state === 'cancelled' ? 'Téléchargement annulé' : 'Téléchargement interrompu'}
                      </span>
                    )}
                    {dl.state === 'completed' && dl.missing && (
                      <span className="text-[12px] text-amber-400 mt-1.5">Le fichier a été déplacé ou supprimé</span>
                    )}

                    {hasActions && (
                    <div className="flex items-center gap-1 mt-2.5 pt-2.5 border-t border-white/5">
                      {inProgress && dl.source === 'browser' && (
                        <motion.button
                          type="button"
                          {...buttonPress}
                          onClick={() => (dl.paused ? window.tora?.resumeDownload(dl.id) : window.tora?.pauseDownload(dl.id))}
                          aria-label={dl.paused ? `Reprendre ${dl.filename}` : `Mettre ${dl.filename} en pause`}
                          title={dl.paused ? 'Reprendre' : 'Pause'}
                          className={iconButton}
                        >
                          {dl.paused ? <Play size={13} /> : <Pause size={13} />}
                        </motion.button>
                      )}
                      {inProgress && (
                        <motion.button
                          type="button"
                          {...buttonPress}
                          onClick={() => window.tora?.cancelDownload(dl.id)}
                          aria-label={`Annuler ${dl.filename}`}
                          title="Annuler"
                          className={iconButton}
                        >
                          <X size={13} />
                        </motion.button>
                      )}
                      {failed && dl.source === 'browser' && (
                        <motion.button
                          type="button"
                          {...buttonPress}
                          onClick={() => window.tora?.retryDownload(dl.id)}
                          aria-label={`Réessayer ${dl.filename}`}
                          title="Réessayer"
                          className="flex items-center gap-1.5 text-[12px] font-medium px-2 py-1.5 bg-surface-2 hover:bg-surface-3 rounded-md border border-line-strong text-muted hover:text-white transition-colors"
                        >
                          <RotateCw size={12} /> Réessayer
                        </motion.button>
                      )}
                      {dl.state === 'completed' && dl.path && !dl.missing && (
                        <>
                          <motion.button
                            type="button"
                            {...buttonPress}
                            onClick={() => window.tora?.showItemInFolder(dl.path)}
                            aria-label={`Afficher le fichier ${dl.filename} dans le dossier`}
                            title="Afficher dans le dossier"
                            className={iconButton}
                          >
                            <Folder size={13} />
                          </motion.button>
                          <motion.button
                            type="button"
                            {...buttonPress}
                            onClick={() => window.tora?.openItem(dl.path)}
                            aria-label={`Ouvrir le fichier ${dl.filename}`}
                            className="text-[12px] font-medium px-2.5 py-1.5 bg-surface-2 hover:bg-surface-3 rounded-md transition-colors border border-line-strong text-muted hover:text-white"
                          >
                            Ouvrir
                          </motion.button>
                        </>
                      )}
                    </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <DownloadCloud size={32} className="mb-4 opacity-50" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-[13px] font-medium">Aucun téléchargement récent</p>
            <p className="text-[12px] mt-1">Les fichiers que vous téléchargez apparaîtront ici.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
