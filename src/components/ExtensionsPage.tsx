import { Shield, ShieldAlert, Ban, Repeat, AlertTriangle, Lock, Fingerprint, Cookie, EyeOff, DownloadCloud, Link2, Radio, ShieldX, Puzzle, Plus, Trash2, CheckCircle, AlertCircle, FolderPlus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cardHover, buttonPress } from '../lib/motion';
import { ToraSettings, InstalledExtension } from '../types';
import Switch from './Switch';
import InlineError from './InlineError';
import { useAutoReset } from '../hooks/useAutoReset';

interface ExtensionsPageProps {
  settings: ToraSettings;
}

export default function ExtensionsPage({ settings }: ExtensionsPageProps) {
  const [extensions, setExtensions] = useState<InstalledExtension[]>([]);
  const [installStatus, setInstallStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useAutoReset(confirmDeleteId, null, () => setConfirmDeleteId(null), 4000);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.resolve(window.tora?.getInstalledExtensions())
      .then(res => setExtensions(res || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggle = (key: keyof ToraSettings) => {
    window.tora?.updateSettings({ [key]: !settings[key] });
  };

  const handleInstallExtension = async () => {
    if (installing) return;
    setInstalling(true);
    setInstallStatus(null);
    try {
      const res = await window.tora?.installExtensionDialog();
      if (res?.ok) {
        setInstallStatus({ ok: true, text: `Extension "${res.extension?.name}" installée avec succès !` });
        const updated = await window.tora?.getInstalledExtensions();
        if (updated) setExtensions(updated);
      } else if (res?.error && res.error !== 'Annulé.') {
        setInstallStatus({ ok: false, text: `Installation impossible : ${res.error}` });
      }
    } catch {
      setInstallStatus({ ok: false, text: "Installation impossible. Vérifiez que le dossier contient un fichier manifest.json valide." });
    } finally {
      setInstalling(false);
    }
  };

  const handleToggleExt = async (id: string, enabled: boolean) => {
    const updated = await window.tora?.toggleExtensionStatus(id, enabled);
    if (updated) setExtensions(updated);
  };

  const handleDeleteExt = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    const updated = await window.tora?.deleteExtension(id);
    if (updated) setExtensions(updated);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-surface-0">
      <div className="max-w-2xl mx-auto px-10 py-16">
        <h1 className="text-[28px] font-semibold text-white mb-1 font-display">Protections & Extensions</h1>
        <p className="text-[13px] text-muted mb-10">Modules de protection et extensions Chrome installées dans Tora</p>

        {/* Section Extensions Chrome */}
        <div className="flex items-center justify-between mt-4 mb-4 px-1">
          <h2 className="text-[13px] font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
            <Puzzle size={16} aria-hidden="true" />
            Extensions Chrome
          </h2>
          <motion.button
            type="button"
            {...buttonPress}
            onClick={handleInstallExtension}
            disabled={installing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FolderPlus size={14} aria-hidden="true" />
            {installing ? 'Installation…' : 'Installer une Extension Chrome'}
          </motion.button>
        </div>

        {installStatus && (
          <div role={installStatus.ok ? 'status' : 'alert'} className={`mb-4 p-3 rounded-xl border text-[12px] flex items-center gap-2 ${installStatus.ok ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            {installStatus.ok ? <CheckCircle size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}
            {installStatus.text}
          </div>
        )}

        <div className="space-y-2 mb-10">
          {loading ? (
            <div role="status" aria-label="Chargement des extensions…" className="h-[72px] rounded-xl bg-surface-1 border border-white/5 animate-pulse" />
          ) : error ? (
            <InlineError message="Impossible de charger les extensions." onRetry={load} />
          ) : extensions.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface-1 border border-white/5 text-center text-muted text-[13px]">
              Aucune extension Chrome installée. Cliquez sur "Installer une Extension Chrome" pour charger un dossier décompressé avec manifest.json.
            </div>
          ) : (
            extensions.map(ext => (
              <motion.div key={ext.id} {...cardHover} className="flex items-center justify-between p-4 rounded-xl bg-surface-1 border border-white/5 hover:border-indigo-500/20 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-1 border border-line flex items-center justify-center shrink-0 text-indigo-400">
                    <Puzzle size={18} />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-ink">{ext.name}</span>
                      <span className="text-[12px] text-muted bg-white/5 px-1.5 py-0.5 rounded">v{ext.version}</span>
                    </div>
                    <span className="text-[12px] text-muted truncate max-w-md">{ext.description}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Switch
                    checked={ext.enabled}
                    ariaLabel={`Activer ou désactiver l'extension ${ext.name}`}
                    onChange={(checked) => handleToggleExt(ext.id, checked)}
                  />
                  <motion.button
                    type="button"
                    {...buttonPress}
                    onClick={() => handleDeleteExt(ext.id)}
                    aria-label={confirmDeleteId === ext.id ? `Confirmer la suppression de l'extension ${ext.name}` : `Supprimer l'extension ${ext.name}`}
                    title={confirmDeleteId === ext.id ? 'Cliquer à nouveau pour confirmer' : "Supprimer l'extension"}
                    className={`p-2 rounded-lg transition-colors ${confirmDeleteId === ext.id ? 'bg-red-700 text-white' : 'text-muted hover:text-red-400 hover:bg-white/5'}`}
                  >
                    <Trash2 size={16} />
                  </motion.button>
                  <span className="sr-only" role="status">{confirmDeleteId === ext.id ? 'Cliquez à nouveau pour confirmer la suppression.' : ''}</span>
                </div>
              </motion.div>
            ))
          )}
        </div>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mt-10 mb-3 px-1">Protections Intégrées</h2>

        <div className="space-y-2">
          <ToggleItem icon={<Shield size={18} />} title="Bloqueur de pubs" sub="Bloque traqueurs et publicités" active={settings.isAdBlockEnabled} onChange={() => toggle('isAdBlockEnabled')} />
          <ToggleItem icon={<Ban size={18} />} title="Anti-popups" sub="Bloque les fenêtres non désirées" active={settings.isPopupBlockerEnabled} onChange={() => toggle('isPopupBlockerEnabled')} />
          <ToggleItem icon={<Repeat size={18} />} title="Anti-redirection" sub="Empêche boucles et forçages" active={settings.isRedirectGuardEnabled} onChange={() => toggle('isRedirectGuardEnabled')} />
          <ToggleItem icon={<AlertTriangle size={18} />} title="Anti-scareware" sub="Masque les fausses alertes" active={settings.isScarewareShieldEnabled} onChange={() => toggle('isScarewareShieldEnabled')} />
          <ToggleItem icon={<ShieldAlert size={18} />} title="Filtre adulte" sub="Bloque les sites de contenu sensible" active={settings.isAdultFilterEnabled} onChange={() => toggle('isAdultFilterEnabled')} />
        </div>

        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mt-10 mb-3 px-1">Vie privée avancée</h2>
        <div className="space-y-2">
          <ToggleItem icon={<Lock size={18} />} title="HTTPS automatique" sub="Bascule vers la version sécurisée d'un site" active={settings.isHttpsUpgradeEnabled} onChange={() => toggle('isHttpsUpgradeEnabled')} />
          <ToggleItem icon={<EyeOff size={18} />} title="En-têtes de confidentialité" sub="Envoie Global Privacy Control et Do Not Track" active={settings.isPrivacyHeadersEnabled} onChange={() => toggle('isPrivacyHeadersEnabled')} />
          <ToggleItem icon={<Fingerprint size={18} />} title="Anti-fingerprinting" sub="Brouille le suivi par empreinte canvas/WebGL/audio" active={settings.isFingerprintProtectionEnabled} onChange={() => toggle('isFingerprintProtectionEnabled')} />
          <ToggleItem icon={<Cookie size={18} />} title="Rejet auto des cookies" sub="Refuse les bannières de consentement non essentielles" active={settings.isCookieAutoRejectEnabled} onChange={() => toggle('isCookieAutoRejectEnabled')} />
          <ToggleItem icon={<Cookie size={18} />} title="Blocage des cookies tiers" sub="Les sites tiers ne peuvent ni lire ni écrire de cookies (exception possible par site)" active={settings.isThirdPartyCookieBlockEnabled} onChange={() => toggle('isThirdPartyCookieBlockEnabled')} />
          <ToggleItem icon={<Link2 size={18} />} title="Nettoyage des liens de suivi" sub="Retire utm_*, fbclid, gclid… des adresses avant de charger la page" active={settings.isUrlCleanerEnabled} onChange={() => toggle('isUrlCleanerEnabled')} />
          <ToggleItem icon={<EyeOff size={18} />} title="Réduction du Referer" sub="N'indique aux autres sites que votre origine, pas la page exacte" active={settings.isReferrerTrimmingEnabled} onChange={() => toggle('isReferrerTrimmingEnabled')} />
          <ToggleItem icon={<Radio size={18} />} title="Protection WebRTC" sub="Empêche les sites de découvrir votre adresse IP locale" active={settings.isWebRtcProtectionEnabled} onChange={() => toggle('isWebRtcProtectionEnabled')} />
          <ToggleItem icon={<ShieldX size={18} />} title="Navigation sécurisée" sub="Bloque les sites de malware et d'hameçonnage connus (vérification locale, rien n'est envoyé)" active={settings.isSafeBrowsingEnabled} onChange={() => toggle('isSafeBrowsingEnabled')} />
        </div>
        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mt-10 mb-3 px-1">Téléchargement</h2>
        <div className="space-y-2">
          <ToggleItem icon={<DownloadCloud size={18} />} title="Détection de médias téléchargeables" sub="Icône de téléchargement sur les vidéos/audios servis directement par la page" active={settings.isMediaDownloadEnabled} onChange={() => toggle('isMediaDownloadEnabled')} />
        </div>
      </div>
    </div>
  );
}

function ToggleItem({ icon, title, sub, active, onChange }: { icon: React.ReactNode; title: string; sub: string; active: boolean; onChange: () => void }) {
  return (
    <motion.div {...cardHover} className="flex items-center justify-between group p-4 rounded-xl bg-surface-1 border border-white/5 hover:border-indigo-500/20 transition-colors">
      <div className="flex items-center space-x-4">
        <div className={`w-10 h-10 rounded-xl bg-surface-1 border border-line flex items-center justify-center group-hover:bg-surface-2 transition-colors shrink-0 ${active ? 'text-indigo-400' : 'text-muted'}`}>
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-medium text-ink">{title}</span>
          <span className="text-[12px] text-muted">{sub}</span>
        </div>
      </div>
      <Switch
        checked={active}
        ariaLabel={title}
        onChange={onChange}
      />
    </motion.div>
  );
}
