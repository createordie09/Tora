import { useState, useEffect, FormEvent } from 'react';
import { FocusModeState } from '../types';
import { Ban, Plus, X, Clock, Power } from 'lucide-react';
import Switch from './Switch';
import InlineError from './InlineError';
import { useUndoableDelete } from '../hooks/useUndoableDelete';

const DAYS = [
  { value: 1, label: 'L', full: 'Lundi' },
  { value: 2, label: 'Ma', full: 'Mardi' },
  { value: 3, label: 'Me', full: 'Mercredi' },
  { value: 4, label: 'J', full: 'Jeudi' },
  { value: 5, label: 'V', full: 'Vendredi' },
  { value: 6, label: 'S', full: 'Samedi' },
  { value: 0, label: 'D', full: 'Dimanche' },
];

export default function FocusPage() {
  const [state, setState] = useState<FocusModeState | null>(null);
  const [newSite, setNewSite] = useState('');
  const [error, setError] = useState(false);
  const undoableDelete = useUndoableDelete();

  const load = () => {
    setError(false);
    Promise.resolve(window.tora?.getFocusMode())
      .then(res => { if (res) setState(res); })
      .catch(() => setError(true));
  };

  useEffect(load, []);

  const refresh = (updated?: FocusModeState) => {
    if (updated) setState(updated);
    else window.tora?.getFocusMode().then(setState);
  };

  const toggleManual = async () => {
    if (!state) return;
    const updated = await window.tora?.updateFocusMode({ manuallyEnabled: !state.manuallyEnabled });
    refresh(updated);
  };

  const toggleScheduleEnabled = async () => {
    if (!state) return;
    const updated = await window.tora?.updateFocusMode({ schedule: { ...state.schedule, enabled: !state.schedule.enabled } });
    refresh(updated);
  };

  const toggleDay = async (day: number) => {
    if (!state) return;
    const days = state.schedule.days.includes(day)
      ? state.schedule.days.filter(d => d !== day)
      : [...state.schedule.days, day];
    const updated = await window.tora?.updateFocusMode({ schedule: { ...state.schedule, days } });
    refresh(updated);
  };

  const updateTime = async (field: 'startTime' | 'endTime', value: string) => {
    if (!state) return;
    const updated = await window.tora?.updateFocusMode({ schedule: { ...state.schedule, [field]: value } });
    refresh(updated);
  };

  const handleAddSite = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSite.trim()) return;
    const sites = await window.tora?.addFocusBlockedSite(newSite.trim());
    if (sites && state) setState({ ...state, blockedSites: sites });
    setNewSite('');
  };

  const handleRemoveSite = (site: string) => {
    undoableDelete(
      `focus:${site}`,
      `${site} retiré de la liste`,
      () => setState(prev => prev && { ...prev, blockedSites: prev.blockedSites.filter(x => x !== site) }),
      () => setState(prev => prev && { ...prev, blockedSites: [...prev.blockedSites, site] }),
      () => { window.tora?.removeFocusBlockedSite(site); },
    );
  };

  if (error) {
    return <div className="flex-1 overflow-y-auto bg-[#050505]"><InlineError message="Impossible de charger le mode Focus." onRetry={load} /></div>;
  }

  if (!state) {
    return (
      <div className="flex-1 overflow-y-auto bg-[#050505]">
        <div role="status" aria-label="Chargement du mode Focus…" className="max-w-2xl mx-auto px-10 py-16 space-y-4">
          <div className="h-8 w-48 rounded bg-[#121212] animate-pulse" />
          <div className="h-20 rounded-2xl bg-[#121212] animate-pulse" />
          <div className="h-40 rounded-2xl bg-[#121212] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505]">
      <div className="max-w-2xl mx-auto px-10 py-16">
        <h1 className="text-[28px] font-semibold text-white mb-1 font-display">Mode Focus</h1>
        <p className="text-[13px] text-muted mb-10">Bloquez temporairement les sites qui vous distraient</p>

        {/* Manual toggle */}
        <div className={`flex items-center justify-between p-5 rounded-2xl border mb-8 transition-colors ${state.isActiveNow ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-[#121212] border-[#222]'}`}>
          <div className="flex items-center space-x-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${state.isActiveNow ? 'bg-indigo-500/20 text-indigo-400' : 'bg-[#161616] border border-[#222] text-muted'}`}>
              <Power size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-medium text-ink">
                {state.isActiveNow ? 'Mode Focus actif' : 'Mode Focus inactif'}
              </span>
              <span className="text-[12px] text-muted">
                {state.manuallyEnabled ? 'Activé manuellement' : state.isActiveNow ? 'Activé par le planning' : 'Activer maintenant, sans attendre le planning'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleManual}
            className={`text-[12px] font-medium px-4 py-2 rounded-lg transition-colors ${state.manuallyEnabled ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-[#1E1E1E] hover:bg-[#282828] text-muted hover:text-white border border-[#2A2A2A]'}`}
          >
            {state.manuallyEnabled ? 'Désactiver' : 'Activer maintenant'}
          </button>
        </div>

        {/* Schedule */}
        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">Planning automatique</h2>
        <div className="p-5 rounded-2xl bg-[#121212] border border-[#222] mb-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center space-x-2 text-[13px] text-ink">
              <Clock size={14} className="text-muted" />
              <span>Activer le planning</span>
            </div>
            <Switch
              checked={state.schedule.enabled}
              onChange={toggleScheduleEnabled}
              ariaLabel="Activer le planning"
            />
          </div>

          <div className="flex items-center gap-3 mb-5">
            <input 
              type="time" 
              aria-label="Heure de début"
              value={state.schedule.startTime} 
              onChange={(e) => updateTime('startTime', e.target.value)} 
              className="flex-1 h-9 px-3 bg-[#0A0A0A] border border-[#5A5A5A] rounded-lg text-[12px] text-ink" 
            />
            <span className="text-muted text-[12px]">à</span>
            <input 
              type="time" 
              aria-label="Heure de fin"
              value={state.schedule.endTime} 
              onChange={(e) => updateTime('endTime', e.target.value)} 
              className="flex-1 h-9 px-3 bg-[#0A0A0A] border border-[#5A5A5A] rounded-lg text-[12px] text-ink" 
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {DAYS.map(d => (
              <button
                type="button"
                key={d.value}
                title={d.full}
                aria-label={d.full}
                aria-pressed={state.schedule.days.includes(d.value)}
                onClick={() => toggleDay(d.value)}
                className={`min-w-[32px] h-8 px-2 rounded-full text-[12px] font-semibold transition-colors ${state.schedule.days.includes(d.value) ? 'bg-indigo-600 text-white' : 'bg-[#1A1A1A] text-muted hover:bg-[#222]'}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Blocked sites */}
        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">Sites bloqués</h2>
        <form onSubmit={handleAddSite} className="flex items-center gap-2 mb-4">
          <label htmlFor="focus-new-site" className="sr-only">Nom de domaine du site à bloquer</label>
          <input
            id="focus-new-site"
            value={newSite}
            onChange={(e) => setNewSite(e.target.value)}
            placeholder="ex: youtube.com"
            className="flex-1 h-10 px-3 bg-[#121212] border border-[#5A5A5A] rounded-lg text-[13px] text-ink placeholder-subtle"
          />
          <button 
            type="submit" 
            aria-label="Ajouter le site à la liste de blocage"
            className="h-10 w-10 flex items-center justify-center bg-[#1E1E1E] hover:bg-[#282828] border border-[#5A5A5A] rounded-lg text-muted hover:text-white transition-colors shrink-0"
          >
            <Plus size={16} />
          </button>
        </form>

        <div className="space-y-1">
          {state.blockedSites.map(site => (
            <div key={site} className="flex items-center justify-between p-3 bg-[#121212] hover:bg-[#161616] rounded-lg border border-[#1E1E1E] group">
              <span className="text-[13px] text-ink">{site}</span>
              <button 
                type="button"
                onClick={() => handleRemoveSite(site)} 
                aria-label={`Supprimer ${site} de la liste`}
                className="p-1.5 rounded-md text-muted hover:bg-[#333] hover:text-red-400 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {state.blockedSites.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted">
              <Ban size={28} className="mb-3 opacity-50" strokeWidth={1.5} />
              <p className="text-[13px] font-medium">Aucun site dans la liste</p>
              <p className="text-[12px] text-muted mt-1">Ajoutez les sites qui vous distraient ci-dessus.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
