import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { FolderOpen, FileText, RefreshCw, Download, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { AppInfo, UpdateStatus } from '../types';
import { popIn } from '../lib/motion';
import InlineError from './InlineError';

const LICENSES: { name: string; license: string; use: string }[] = [
  { name: 'Electron / Chromium', license: 'MIT / BSD-3-Clause', use: 'Moteur du navigateur' },
  { name: 'Ghostery Adblocker', license: 'MPL-2.0', use: 'Moteur de blocage des publicités et traqueurs' },
  { name: 'EasyList et EasyPrivacy', license: 'GPL-3.0+ ou CC BY-SA 3.0', use: 'Listes de filtres publicitaires et de traçage (easylist.to)' },
  { name: 'URLhaus (abuse.ch)', license: 'CC0', use: 'Liste de sites diffusant des logiciels malveillants' },
  { name: 'OpenPhish', license: 'Flux communautaire gratuit', use: "Liste de sites d'hameçonnage" },
  { name: 'StevenBlack/hosts', license: 'MIT', use: 'Liste du filtre de contenu adulte (si activé)' },
  { name: 'Have I Been Pwned', license: 'API publique (CC BY 4.0)', use: 'Vérification des fuites de mots de passe (à votre demande)' },
  { name: 'React, Motion, Lucide, Tailwind CSS', license: 'MIT / ISC', use: "Interface de Tora" },
  { name: 'Outfit (Google Fonts)', license: 'SIL OFL 1.1', use: 'Police des titres, installée localement' },
  { name: 'sql.js, qrcode, electron-log, electron-updater', license: 'MIT', use: 'Import Chrome, QR codes, journaux, mises à jour' },
];

const NETWORK_USES: string[] = [
  'Listes de filtres EasyList et EasyPrivacy (easylist.to), au démarrage.',
  'Listes de sites dangereux URLhaus et OpenPhish, toutes les 6 heures. La vérification se fait sur votre ordinateur : les adresses que vous visitez ne sont pas envoyées.',
  'Liste du filtre de contenu adulte (GitHub), uniquement si ce filtre est activé.',
  'Vérification des fuites de mots de passe, uniquement quand vous la lancez : 5 caractères d\'une empreinte chiffrée par mot de passe.',
  'DNS sécurisé, uniquement si vous choisissez un fournisseur dans les Paramètres.',
  'Recherche de mises à jour de Tora.',
];

function updateText(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking': return 'Recherche de mises à jour…';
    case 'available': return `Mise à jour ${status.version ?? ''} disponible, téléchargement en cours…`;
    case 'downloading': return `Téléchargement de la mise à jour : ${status.percent ?? 0} %`;
    case 'ready': return `La mise à jour ${status.version ?? ''} est prête. Redémarrez Tora pour l'installer.`;
    case 'none': return 'Tora est à jour.';
    case 'error': return status.message ?? 'La recherche de mise à jour a échoué.';
    case 'disabled': return status.message ?? 'Les mises à jour automatiques ne sont pas disponibles.';
    default: return 'Aucune recherche effectuée pour le moment.';
  }
}

export default function AboutPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    Promise.resolve(window.tora?.getAppInfo())
      .then(res => { if (res) { setInfo(res); setUpdate(res.update); } })
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
    return window.tora?.onUpdateStatus(setUpdate);
  }, []);

  if (error) return <div className="flex-1 overflow-y-auto bg-surface-0"><InlineError message="Impossible de charger les informations." onRetry={load} /></div>;

  const busy = update.state === 'checking' || update.state === 'downloading' || update.state === 'available';
  const canCheck = !!info && update.state !== 'disabled' && !busy && update.state !== 'ready';

  return (
    <motion.div {...popIn} className="flex-1 overflow-y-auto bg-surface-0">
      <div className="max-w-2xl mx-auto px-10 py-16">
        <div className="flex items-center gap-5 mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-indigo-500 to-indigo-900 flex items-center justify-center text-[34px] font-semibold text-white font-display" aria-hidden="true">T</div>
          <div>
            <h1 className="text-[28px] font-semibold text-white font-display leading-tight">Tora</h1>
            <p className="text-[13px] text-muted">{info ? `Version ${info.version}` : 'Chargement…'}</p>
          </div>
        </div>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">Mises à jour</h2>
        <div className="p-5 rounded-2xl bg-surface-1 border border-line mb-10">
          <div className="flex items-start gap-3">
            {update.state === 'none' || update.state === 'ready' ? <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
              : update.state === 'error' ? <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
              : busy ? <Loader2 size={18} className="text-indigo-400 mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
              : <RefreshCw size={18} className="text-muted mt-0.5 shrink-0" aria-hidden="true" />}
            <p className="text-[13px] text-ink leading-relaxed" role="status">{updateText(update)}</p>
          </div>
          <div className="flex items-center gap-2 mt-4">
            {update.state === 'ready' ? (
              <button type="button" onClick={() => window.tora?.installUpdate()} className="h-9 px-4 flex items-center gap-2 text-[12px] font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white transition-colors">
                <Download size={13} aria-hidden="true" /> Redémarrer et installer
              </button>
            ) : (
              <button type="button" onClick={() => window.tora?.checkForUpdates()} disabled={!canCheck} className="h-9 px-4 flex items-center gap-2 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 border border-line-strong rounded-lg text-muted hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <RefreshCw size={13} aria-hidden="true" /> Rechercher des mises à jour
              </button>
            )}
          </div>
        </div>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">Vos données</h2>
        <div className="p-5 rounded-2xl bg-surface-1 border border-line mb-10 text-[13px]">
          <p className="text-muted leading-relaxed mb-3">
            Tout reste sur votre ordinateur : favoris, historique, mots de passe (chiffrés par votre système) et réglages. Tora ne collecte aucune statistique d'usage et ne possède aucun serveur.
          </p>
          <dl className="space-y-2 mb-4">
            <div><dt className="text-[12px] text-subtle">Dossier des données</dt><dd className="font-mono text-[12px] text-ink break-all">{info?.userDataPath ?? '…'}</dd></div>
            <div><dt className="text-[12px] text-subtle">Journaux d'erreurs</dt><dd className="font-mono text-[12px] text-ink break-all">{info?.logPath ?? '…'}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => window.tora?.openDataFolder()} className="h-9 px-3 flex items-center gap-2 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 border border-line-strong rounded-lg text-muted hover:text-white transition-colors">
              <FolderOpen size={13} aria-hidden="true" /> Ouvrir le dossier des données
            </button>
            <button type="button" onClick={() => window.tora?.openLogFolder()} className="h-9 px-3 flex items-center gap-2 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 border border-line-strong rounded-lg text-muted hover:text-white transition-colors">
              <FileText size={13} aria-hidden="true" /> Ouvrir les journaux
            </button>
          </div>
        </div>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">Connexions réseau de Tora</h2>
        <ul className="p-5 rounded-2xl bg-surface-1 border border-line mb-10 space-y-2 text-[13px] text-muted leading-relaxed list-disc list-inside">
          {NETWORK_USES.map(line => <li key={line}>{line}</li>)}
        </ul>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">Licences et sources</h2>
        <div className="rounded-2xl bg-surface-1 border border-line mb-10 divide-y divide-[#1E1E1E]">
          {LICENSES.map(item => (
            <div key={item.name} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium text-ink">{item.name}</span>
                <span className="text-[12px] text-subtle shrink-0">{item.license}</span>
              </div>
              <p className="text-[12px] text-muted mt-0.5">{item.use}</p>
            </div>
          ))}
        </div>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">Informations techniques</h2>
        <dl className="p-5 rounded-2xl bg-surface-1 border border-line grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[12px]">
          <dt className="text-subtle">Tora</dt><dd className="text-ink font-mono">{info?.version ?? '…'}</dd>
          <dt className="text-subtle">Electron</dt><dd className="text-ink font-mono">{info?.electron ?? '…'}</dd>
          <dt className="text-subtle">Chromium</dt><dd className="text-ink font-mono">{info?.chrome ?? '…'}</dd>
          <dt className="text-subtle">Node.js</dt><dd className="text-ink font-mono">{info?.node ?? '…'}</dd>
          <dt className="text-subtle">Système</dt><dd className="text-ink font-mono">{info?.platform ?? '…'}</dd>
        </dl>
      </div>
    </motion.div>
  );
}
