import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DownloadItem } from '../types';
import { Folder, FileCheck, AlertCircle, DownloadCloud, Loader2, Pause, Play, X, RotateCw, FileX } from 'lucide-react';
import Favicon from './Favicon';
import { popIn, cardHover, buttonPress } from '../lib/motion';
import CardGridSkeleton from './CardGridSkeleton';
import InlineError from './InlineError';

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

  const hasFinished = downloads.some(d => d.state !== 'progressing');

  return (
    <motion.div {...popIn} className="flex-1 overflow-y-auto bg-[#050505]">
      <div className="max-w-5xl mx-auto px-10 py-16">
        <div className="flex items-start justify-between gap-4 mb-10">
          <div>
            <h1 className="text-[28px] font-semibold text-white mb-1 font-display">Téléchargements</h1>
            <p className="text-[13px] text-muted">Fichiers téléchargés depuis vos onglets</p>
          </div>
          {hasFinished && (
            <button
              type="button"
              onClick={() => window.tora?.clearDownloads()}
              className="mt-2 text-[12px] font-medium px-3 py-2 bg-[#161616] hover:bg-[#1E1E1E] rounded-lg border border-[#5A5A5A] text-muted hover:text-white transition-colors shrink-0"
            >
              Vider la liste
            </button>
          )}
        </div>

        {loading ? (
          <CardGridSkeleton label="Chargement des téléchargements…" />
        ) : error ? (
          <InlineError message="Impossible de charger les téléchargements." onRetry={load} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            <AnimatePresence mode="popLayout">
              {downloads.map(dl => {
                const inProgress = dl.state === 'progressing';
                const failed = dl.state === 'interrupted' || dl.state === 'cancelled';
                const percent = dl.totalBytes > 0 ? Math.min(100, (dl.receivedBytes / dl.totalBytes) * 100) : 0;
                return (
                  <motion.div
                    key={dl.id}
                    layout
                    {...cardHover}
                    className="flex flex-col p-3.5 rounded-xl bg-[#101014] border border-white/5 hover:border-indigo-500/20 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="relative w-9 h-9 mb-2.5 shrink-0">
                        <div className="w-9 h-9 rounded-lg bg-[#161616] border border-[#242424] flex items-center justify-center">
                          <Favicon src={dl.favicon} size={15} />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#121212] border border-[#242424] flex items-center justify-center">
                          {dl.state === 'completed' ? (dl.missing ? <FileX size={9} className="text-amber-400" aria-label="Fichier introuvable" /> : <FileCheck size={9} className="text-indigo-400" aria-label="Terminé" />) :
                           inProgress ? (dl.paused ? <Pause size={9} className="text-amber-400" aria-label="En pause" /> : <Loader2 size={9} className="text-indigo-400 animate-spin" aria-label="En cours" />) :
                           <AlertCircle size={9} className="text-red-400" aria-label={dl.state === 'cancelled' ? 'Annulé' : 'Échec du téléchargement'} />}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => window.tora?.removeDownload(dl.id)}
                        aria-label={`Retirer ${dl.filename} de la liste`}
                        title={inProgress ? 'Annuler et retirer' : 'Retirer de la liste'}
                        className={iconButton}
                      >
                        <X size={13} />
                      </button>
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
                          className="w-full bg-[#0A0A0A] h-1 mt-2 rounded-full overflow-hidden border border-[#222]"
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
                          className="flex items-center gap-1.5 text-[12px] font-medium px-2 py-1.5 bg-[#1E1E1E] hover:bg-[#282828] rounded-md border border-[#5A5A5A] text-muted hover:text-white transition-colors"
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
                            className="text-[12px] font-medium px-2.5 py-1.5 bg-[#1E1E1E] hover:bg-[#282828] rounded-md transition-colors border border-[#5A5A5A] text-muted hover:text-white"
                          >
                            Ouvrir
                          </motion.button>
                        </>
                      )}
                      {!inProgress && !(dl.state === 'completed' && dl.path && !dl.missing) && !(failed && dl.source === 'browser') && (
                        <span className="sr-only">Aucune action disponible</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {!loading && !error && downloads.length === 0 && (
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
