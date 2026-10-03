import { useState, useEffect } from 'react';
import { Search, Power, FolderOpen, Trash2, Loader2, Globe, Boxes, Plus } from 'lucide-react';
import { ToraSettings, ClearDataOptions, Container } from '../types';
import { SEARCH_ENGINE_OPTIONS } from '../lib/searchEngines';
import Switch from './Switch';
import { useToast } from './Toast';
import { useAutoReset } from '../hooks/useAutoReset';

const rowClass = 'flex items-center justify-between gap-4 group p-4 rounded-xl hover:bg-surface-1 transition-colors border border-transparent hover:border-line';
const iconBox = 'w-10 h-10 rounded-xl bg-surface-1 border border-line flex items-center justify-center shrink-0';
const fieldClass = 'h-9 px-3 bg-surface-1 border border-line-strong rounded-lg text-[13px] text-ink';
const sectionTitle = 'text-[13px] font-semibold text-muted uppercase tracking-wider mt-10 mb-3 px-1';

export function SearchAndStartupSection({ settings }: { settings: ToraSettings }) {
  const [homepage, setHomepage] = useState(settings.homepageUrl);
  const [homepageError, setHomepageError] = useState<string | null>(null);

  const saveHomepage = () => {
    const value = homepage.trim();
    if (value && /^(javascript|data|file|vbscript):/i.test(value)) {
      setHomepageError("Cette adresse n'est pas autorisée. Utilisez une adresse web, par exemple exemple.com.");
      return;
    }
    setHomepageError(null);
    window.tora?.updateSettings({ homepageUrl: value });
  };

  return (
    <>
      <h2 className={sectionTitle}>Recherche et démarrage</h2>
      <div className="space-y-2">
        <div className={rowClass}>
          <div className="flex items-center space-x-4">
            <div className={iconBox}><Search size={18} className="text-muted" aria-hidden="true" /></div>
            <div className="flex flex-col">
              <label htmlFor="search-engine" className="text-[14px] font-medium text-ink">Moteur de recherche</label>
              <span className="text-[12px] text-muted">Utilisé pour la barre d'adresse et la recherche dans le menu contextuel</span>
            </div>
          </div>
          <select
            id="search-engine"
            value={settings.searchEngine}
            onChange={(e) => window.tora?.updateSettings({ searchEngine: e.target.value })}
            className={fieldClass}
          >
            {SEARCH_ENGINE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <fieldset className={`${rowClass} !items-start`}>
          <div className="flex items-start space-x-4 w-full">
            <div className={iconBox}><Power size={18} className="text-muted" aria-hidden="true" /></div>
            <div className="flex flex-col flex-1 min-w-0">
              <legend className="text-[14px] font-medium text-ink">Au démarrage</legend>
              <div className="mt-2 space-y-2 text-[13px] text-ink">
                {([
                  ['restore', 'Reprendre là où vous vous étiez arrêté'],
                  ['newtab', 'Ouvrir la page Nouvel onglet'],
                  ['homepage', 'Ouvrir une page précise'],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="startup-mode"
                      checked={settings.startupMode === value}
                      onChange={() => window.tora?.updateSettings({ startupMode: value })}
                      className="accent-indigo-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {settings.startupMode === 'homepage' && (
                <div className="mt-3">
                  <label htmlFor="homepage-url" className="block text-[12px] text-muted mb-1">Adresse de la page</label>
                  <input
                    id="homepage-url"
                    value={homepage}
                    onChange={(e) => { setHomepage(e.target.value); setHomepageError(null); }}
                    onBlur={saveHomepage}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveHomepage(); }}
                    placeholder="exemple.com"
                    aria-invalid={!!homepageError || undefined}
                    aria-describedby={homepageError ? 'homepage-error' : undefined}
                    className={`${fieldClass} w-full max-w-sm`}
                  />
                  {homepageError && <p id="homepage-error" role="alert" className="text-[12px] text-red-400 mt-1.5">{homepageError}</p>}
                </div>
              )}
            </div>
          </div>
        </fieldset>
      </div>
    </>
  );
}

export function DownloadsSection({ settings }: { settings: ToraSettings }) {
  const chooseFolder = async () => {
    const dir = await window.tora?.chooseDownloadDirectory();
    if (dir) window.tora?.updateSettings({ downloadDirectory: dir });
  };

  return (
    <>
      <h2 className={sectionTitle}>Téléchargements</h2>
      <div className="space-y-2">
        <div className={rowClass}>
          <div className="flex items-center space-x-4 min-w-0">
            <div className={iconBox}><FolderOpen size={18} className="text-muted" aria-hidden="true" /></div>
            <div className="flex flex-col min-w-0">
              <span className="text-[14px] font-medium text-ink">Dossier de téléchargement</span>
              <span className="text-[12px] text-muted truncate" title={settings.downloadDirectory || undefined}>
                {settings.downloadDirectory || 'Dossier Téléchargements par défaut'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {settings.downloadDirectory && (
              <button
                type="button"
                onClick={() => window.tora?.updateSettings({ downloadDirectory: '' })}
                className="h-9 px-3 text-[12px] font-medium rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors"
              >
                Par défaut
              </button>
            )}
            <button
              type="button"
              onClick={chooseFolder}
              className="h-9 px-3 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 border border-line-strong rounded-lg text-muted hover:text-white transition-colors"
            >
              Modifier…
            </button>
          </div>
        </div>
        <div className={rowClass}>
          <div className="flex flex-col">
            <span className="text-[14px] font-medium text-ink">Demander où enregistrer chaque fichier</span>
            <span className="text-[12px] text-muted">Désactivé : les fichiers vont directement dans le dossier ci-dessus, sans jamais écraser un fichier existant</span>
          </div>
          <Switch
            checked={settings.askDownloadLocation}
            onChange={(checked) => window.tora?.updateSettings({ askDownloadLocation: checked })}
            ariaLabel="Demander où enregistrer chaque fichier"
          />
        </div>
      </div>
    </>
  );
}

const CLEAR_ITEMS: { key: keyof Omit<ClearDataOptions, 'range'>; label: string; hint: string }[] = [
  { key: 'history', label: 'Historique de navigation', hint: 'Pages visitées' },
  { key: 'downloads', label: 'Liste des téléchargements', hint: 'Les fichiers eux-mêmes ne sont pas supprimés' },
  { key: 'cookies', label: 'Cookies et données de sites', hint: 'Vous serez déconnecté des sites (toute la période)' },
  { key: 'cache', label: 'Images et fichiers en cache', hint: "Libère de l'espace disque (toute la période)" },
  { key: 'permissions', label: 'Autorisations des sites', hint: 'Caméra, micro, localisation, notifications' },
];

export function ClearDataSection() {
  const { showToast } = useToast();
  const [range, setRange] = useState<ClearDataOptions['range']>('day');
  const [selected, setSelected] = useState<Record<string, boolean>>({ history: true, downloads: false, cookies: false, cache: true, permissions: false });
  const [confirming, setConfirming] = useState(false);
  useAutoReset(confirming, false, () => setConfirming(false), 5000);
  const [busy, setBusy] = useState(false);

  const anySelected = Object.values(selected).some(Boolean);

  const run = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    try {
      const res = await window.tora?.clearBrowsingData({
        range,
        history: !!selected.history,
        downloads: !!selected.downloads,
        cookies: !!selected.cookies,
        cache: !!selected.cache,
        permissions: !!selected.permissions,
      });
      if (res?.ok) showToast('Données de navigation effacées', 'success');
      else showToast("Impossible d'effacer les données. Réessayez.", 'error');
    } catch {
      showToast("Impossible d'effacer les données. Réessayez.", 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className={sectionTitle}>Effacer les données de navigation</h2>
      <fieldset className="p-5 rounded-2xl bg-surface-1 border border-line">
        <legend className="sr-only">Données à effacer</legend>
        <div className="flex items-center gap-3 mb-4">
          <label htmlFor="clear-range" className="text-[13px] text-ink">Période</label>
          <select id="clear-range" value={range} onChange={(e) => setRange(e.target.value as ClearDataOptions['range'])} className={fieldClass}>
            <option value="hour">Dernière heure</option>
            <option value="day">Dernières 24 heures</option>
            <option value="week">7 derniers jours</option>
            <option value="all">Toute la période</option>
          </select>
        </div>
        <div className="space-y-3 mb-5">
          {CLEAR_ITEMS.map(item => (
            <label key={item.key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!selected[item.key]}
                onChange={(e) => setSelected(prev => ({ ...prev, [item.key]: e.target.checked }))}
                className="accent-indigo-500 mt-0.5"
              />
              <span className="flex flex-col">
                <span className="text-[13px] text-ink">{item.label}</span>
                <span className="text-[12px] text-muted">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!anySelected || busy}
          className={`h-9 px-4 flex items-center gap-2 text-[12px] font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirming ? 'bg-red-700 hover:bg-red-600 border-red-600 text-white' : 'bg-surface-2 hover:bg-surface-3 border-line-strong text-muted hover:text-white'}`}
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
          {confirming ? 'Cliquez à nouveau pour confirmer' : 'Effacer les données'}
        </button>
        <span className="sr-only" role="status">{confirming ? 'Cliquez à nouveau pour confirmer la suppression.' : ''}</span>
        <p className="text-[12px] text-muted mt-3">Raccourci : Ctrl + Maj + Suppr</p>
      </fieldset>
    </>
  );
}

export function SecureDnsSection({ settings }: { settings: ToraSettings }) {
  return (
    <>
      <h2 className={sectionTitle}>Réseau</h2>
      <div className={rowClass}>
        <div className="flex items-center space-x-4">
          <div className={iconBox}><Globe size={18} className="text-muted" aria-hidden="true" /></div>
          <div className="flex flex-col">
            <label htmlFor="secure-dns" className="text-[14px] font-medium text-ink">DNS sécurisé (DoH)</label>
            <span className="text-[12px] text-muted max-w-md">Chiffre la résolution des noms de sites pour que votre fournisseur d'accès ne voie pas la liste de vos visites. Le fournisseur choisi les verra à sa place.</span>
          </div>
        </div>
        <select
          id="secure-dns"
          value={settings.secureDns}
          onChange={(e) => window.tora?.updateSettings({ secureDns: e.target.value as ToraSettings['secureDns'] })}
          className={fieldClass}
        >
          <option value="off">Désactivé (système)</option>
          <option value="cloudflare">Cloudflare</option>
          <option value="quad9">Quad9</option>
          <option value="google">Google</option>
        </select>
      </div>
    </>
  );
}

const CONTAINER_COLORS = [
  { value: '#60A5FA', label: 'Bleu' },
  { value: '#34D399', label: 'Vert' },
  { value: '#FBBF24', label: 'Jaune' },
  { value: '#F87171', label: 'Rouge' },
  { value: '#C084FC', label: 'Violet' },
  { value: '#F472B6', label: 'Rose' },
];

export function ContainersSection() {
  const { showToast } = useToast();
  const [containers, setContainers] = useState<Container[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CONTAINER_COLORS[0].value);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useAutoReset(confirmDeleteId, null, () => setConfirmDeleteId(null), 4000);

  const load = () => Promise.resolve(window.tora?.getContainers()).then(c => setContainers(c || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (container: { id?: string; name: string; color: string }) => {
    try {
      const updated = await window.tora?.saveContainer(container);
      if (updated) setContainers(updated);
    } catch {
      showToast("Impossible d'enregistrer le conteneur.", 'error');
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    await save({ name, color: newColor });
    setNewName('');
  };

  const remove = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    try {
      const updated = await window.tora?.deleteContainer(id);
      if (updated) setContainers(updated);
      showToast('Conteneur supprimé, ses onglets et ses données ont été effacés', 'success');
    } catch {
      showToast('Impossible de supprimer le conteneur.', 'error');
    }
  };

  return (
    <>
      <h2 className={sectionTitle}>Conteneurs</h2>
      <p className="text-[12px] text-muted mb-3 px-1 leading-relaxed">
        Un conteneur est un espace de navigation isolé : ses cookies et ses connexions sont séparés de vos autres onglets (par exemple un compte professionnel et un compte personnel sur le même site). Ouvrez-en un depuis le menu principal.
      </p>
      <div className="space-y-2">
        {containers.map(c => (
          <div key={c.id} className={rowClass}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={iconBox}><Boxes size={18} style={{ color: c.color }} aria-hidden="true" /></div>
              <input
                defaultValue={c.name}
                maxLength={30}
                aria-label={`Nom du conteneur ${c.name}`}
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== c.name) save({ id: c.id, name, color: c.color }); else e.target.value = c.name; }}
                className={`${fieldClass} w-full max-w-[220px]`}
              />
              <div role="group" aria-label={`Couleur de ${c.name}`} className="flex items-center gap-1">
                {CONTAINER_COLORS.map(col => (
                  <button
                    key={col.value}
                    type="button"
                    onClick={() => save({ id: c.id, name: c.name, color: col.value })}
                    aria-label={col.label}
                    aria-pressed={c.color === col.value}
                    title={col.label}
                    className={`w-6 h-6 rounded-full border-2 ${c.color === col.value ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: col.value }}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(c.id)}
              aria-label={confirmDeleteId === c.id ? `Confirmer la suppression du conteneur ${c.name}` : `Supprimer le conteneur ${c.name}`}
              title={confirmDeleteId === c.id ? 'Cliquer à nouveau : ses onglets et ses données seront effacés' : 'Supprimer'}
              className={`p-2 rounded-lg transition-colors shrink-0 ${confirmDeleteId === c.id ? 'bg-red-700 text-white' : 'text-muted hover:text-red-400 hover:bg-white/5'}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <form
          onSubmit={(e) => { e.preventDefault(); add(); }}
          className="flex items-center gap-2 p-4"
        >
          <label htmlFor="new-container" className="sr-only">Nom du nouveau conteneur</label>
          <input
            id="new-container"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={30}
            placeholder="Nouveau conteneur (ex. Banque)"
            className={`${fieldClass} flex-1 max-w-xs placeholder-subtle`}
          />
          <select
            aria-label="Couleur du nouveau conteneur"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className={fieldClass}
          >
            {CONTAINER_COLORS.map(col => <option key={col.value} value={col.value}>{col.label}</option>)}
          </select>
          <button
            type="submit"
            disabled={!newName.trim() || containers.length >= 8}
            className="h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 border border-line-strong rounded-lg text-muted hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={14} aria-hidden="true" /> Ajouter
          </button>
        </form>
        {containers.length >= 8 && <p className="text-[12px] text-muted px-4">Maximum de 8 conteneurs atteint.</p>}
      </div>
    </>
  );
}
