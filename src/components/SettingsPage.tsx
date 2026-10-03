import { Shield, ShieldAlert, PanelLeft, Chrome, Loader2, Zap, Download, Film } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';
import { cardHover } from '../lib/motion';
import { ToraSettings } from '../types';
import Switch from './Switch';
import { SearchAndStartupSection, DownloadsSection, ClearDataSection, SecureDnsSection, ContainersSection } from './SettingsSections';

interface SettingsPageProps {
  settings: ToraSettings;
}

export default function SettingsPage({ settings }: SettingsPageProps) {
  const [importBusy, setImportBusy] = useState<'bookmarks' | 'passwords' | null>(null);
  const [importResult, setImportResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleImportBookmarks = async () => {
    setImportBusy('bookmarks');
    setImportResult(null);
    let result;
    try { result = await window.tora?.importChromeBookmarks(); } catch { result = undefined; }
    setImportBusy(null);
    if (result?.ok) {
      setImportResult({ ok: true, text: `${result.imported} favori(s) importé(s)${result.skipped ? ` (${result.skipped} déjà présents)` : ''}.` });
    } else {
      setImportResult({ ok: false, text: result?.error || "Échec de l'import des favoris." });
    }
  };

  const handleImportPasswords = async () => {
    setImportBusy('passwords');
    setImportResult(null);
    let result;
    try { result = await window.tora?.importChromePasswords(); } catch { result = undefined; }
    setImportBusy(null);
    if (result?.ok) {
      setImportResult({ ok: true, text: `${result.imported} mot(s) de passe importé(s), ${result.updated} mis à jour.` });
    } else {
      setImportResult({ ok: false, text: result?.error || "Échec de l'import des mots de passe." });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-surface-0">
      <div className="max-w-2xl mx-auto px-10 py-16">
        <h1 className="text-[28px] font-semibold text-white mb-1 font-display">Paramètres</h1>
        <p className="text-[13px] text-muted mb-10">Protections de navigation de Tora</p>

        <div className="space-y-2">
          <motion.div {...cardHover} className="flex items-center justify-between group p-4 rounded-xl bg-surface-1 border border-white/5 hover:border-indigo-500/30 transition-colors shadow-sm">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-surface-1 border border-line flex items-center justify-center group-hover:bg-surface-2 transition-colors shrink-0">
                <Shield size={18} className="text-muted group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-ink">Bloqueur de publicités</span>
                <span className="text-[12px] text-muted">Bloque traqueurs, pubs et popups intrusifs</span>
              </div>
            </div>
            <Switch
              checked={settings.isAdBlockEnabled}
              onChange={() => window.tora?.toggleAdBlock()}
              ariaLabel="Bloqueur de publicités"
            />
          </motion.div>

          <div className="flex items-center justify-between group p-4 rounded-xl hover:bg-surface-1 transition-colors border border-transparent hover:border-line">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-surface-1 border border-line flex items-center justify-center group-hover:bg-surface-2 transition-colors shrink-0">
                <ShieldAlert size={18} className="text-muted group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-ink">Filtre contenu adulte</span>
                <span className="text-[12px] text-muted">Bloque les sites de contenu sensible</span>
              </div>
            </div>
            <Switch
              checked={settings.isAdultFilterEnabled}
              onChange={(checked) => window.tora?.toggleAdultFilter(checked)}
              ariaLabel="Filtre contenu adulte"
            />
          </div>
        </div>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mt-10 mb-3 px-1 flex items-center gap-1.5">
          <Zap size={14} className="text-indigo-400" />
          Performances & Moteur Turbo
        </h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between group p-4 rounded-xl hover:bg-surface-1 transition-colors border border-transparent hover:border-line">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-surface-1 border border-line flex items-center justify-center group-hover:bg-surface-2 transition-colors shrink-0">
                <Download size={18} className="text-muted group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-ink">Téléchargement Multi-Segment Ultra-Rapide</span>
                <span className="text-[12px] text-muted">Découpe les fichiers en 8 à 16 flux parallèles pour accélérer la vitesse de téléchargement</span>
              </div>
            </div>
            <Switch
              checked={settings.isAcceleratedDownloadEnabled}
              onChange={() => window.tora?.updateSettings({ isAcceleratedDownloadEnabled: !settings.isAcceleratedDownloadEnabled })}
              ariaLabel="Téléchargement Multi-Segment Ultra-Rapide"
            />
          </div>

          <div className="flex items-center justify-between group p-4 rounded-xl hover:bg-surface-1 transition-colors border border-transparent hover:border-line">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-surface-1 border border-line flex items-center justify-center group-hover:bg-surface-2 transition-colors shrink-0">
                <Film size={18} className="text-muted group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-ink">Streaming Vidéo Turbo (Pré-chargement HLS/DASH)</span>
                <span className="text-[12px] text-muted">Pré-charge les chunks vidéo en mémoire RAM & active l'accélération matérielle GPU</span>
              </div>
            </div>
            <Switch
              checked={settings.isVideoStreamTurboEnabled}
              onChange={() => window.tora?.updateSettings({ isVideoStreamTurboEnabled: !settings.isVideoStreamTurboEnabled })}
              ariaLabel="Streaming Vidéo Turbo"
            />
          </div>
        </div>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mt-10 mb-3 px-1">Apparence</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between group p-4 rounded-xl hover:bg-surface-1 transition-colors border border-transparent hover:border-line">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-surface-1 border border-line flex items-center justify-center group-hover:bg-surface-2 transition-colors shrink-0">
                <PanelLeft size={18} className="text-muted group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-ink">Onglets verticaux</span>
                <span className="text-[12px] text-muted">Affiche les onglets dans une barre latérale au lieu du haut</span>
              </div>
            </div>
            <Switch
              checked={settings.isVerticalTabsEnabled}
              onChange={() => window.tora?.updateSettings({ isVerticalTabsEnabled: !settings.isVerticalTabsEnabled })}
              ariaLabel="Onglets verticaux"
            />
          </div>
        </div>
        <p className="text-[12px] text-muted mt-4 px-1 leading-relaxed">
          Astuce : clic-droit sur un onglet pour lui assigner une couleur de groupe. Glissez-déposez les onglets pour les réordonner.
        </p>

        <SearchAndStartupSection settings={settings} />
        <DownloadsSection settings={settings} />
        <SecureDnsSection settings={settings} />
        <ContainersSection />
        <ClearDataSection />

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mt-10 mb-3 px-1">Importer depuis Chrome</h2>
        <div className="p-5 rounded-2xl bg-surface-1 border border-line space-y-3">
          <div className="flex items-center space-x-3 mb-1">
            <Chrome size={16} className="text-muted" aria-hidden="true" />
            <span className="text-[13px] text-muted">Récupère vos données depuis Chrome installé sur cette machine (Windows uniquement).</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImportBookmarks}
              disabled={importBusy !== null}
              className="flex-1 h-9 flex items-center justify-center gap-2 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 disabled:opacity-50 border border-line-strong rounded-lg text-muted hover:text-white transition-colors"
            >
              {importBusy === 'bookmarks' && <Loader2 size={13} className="animate-spin" />}
              Importer les favoris
            </button>
            <button
              type="button"
              onClick={handleImportPasswords}
              disabled={importBusy !== null}
              className="flex-1 h-9 flex items-center justify-center gap-2 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 disabled:opacity-50 border border-line-strong rounded-lg text-muted hover:text-white transition-colors"
            >
              {importBusy === 'passwords' && <Loader2 size={13} className="animate-spin" />}
              Importer les mots de passe
            </button>
          </div>
          {importResult && (
            <p role={importResult.ok ? 'status' : 'alert'} className={`text-[12px] ${importResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{importResult.text}</p>
          )}
          <p className="text-[12px] text-muted leading-relaxed">
            Pour les mots de passe, fermez Chrome avant de lancer l'import.
          </p>
        </div>
      </div>
    </div>
  );
}
