import { useState } from 'react';
import { ShieldX, ChevronDown } from 'lucide-react';
import { TabData } from '../types';
import Button from './Button';

interface ThreatWarningPageProps {
  tab: TabData & { threatWarning: NonNullable<TabData['threatWarning']> };
}

export default function ThreatWarningPage({ tab }: ThreatWarningPageProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { host, url } = tab.threatWarning;

  return (
    <div className="flex-1 overflow-y-auto bg-surface-0">
      <div className="max-w-xl mx-auto px-8 py-20 flex flex-col">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-6">
          <ShieldX size={28} aria-hidden="true" />
        </div>
        <h1 className="text-[24px] font-semibold text-ink mb-3 font-display">Site dangereux bloqué</h1>
        <p className="text-[14px] text-muted leading-relaxed mb-2">
          <strong className="text-ink font-semibold">{host}</strong> figure dans une liste de sites qui diffusent actuellement des logiciels malveillants
          ou tentent de voler des identifiants (hameçonnage). Tora a bloqué l'accès pour vous protéger.
        </p>

        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          aria-expanded={showDetails}
          className="self-start flex items-center gap-1.5 mt-2 mb-1 text-[13px] text-muted hover:text-ink transition-colors"
        >
          <ChevronDown size={14} className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} aria-hidden="true" />
          Détails
        </button>
        {showDetails && (
          <div className="p-4 rounded-xl bg-surface-1 border border-white/10 text-[13px] text-muted leading-relaxed mb-2">
            <p>La vérification se fait sur votre ordinateur, à partir de listes publiques (URLhaus, OpenPhish) : l'adresse que vous visitez n'est envoyée à personne.</p>
            <p className="mt-2 text-subtle break-all font-mono text-[12px]">{url}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <Button variant="primary" size="md" autoFocus onClick={() => window.tora?.threatGoBack(tab.id)}>
            Retour en lieu sûr
          </Button>
          <button
            type="button"
            onClick={() => window.tora?.threatProceed(tab.id)}
            className="h-10 px-4 rounded-lg border border-line-strong bg-transparent hover:bg-red-500/10 hover:border-red-500/50 text-[13px] text-muted hover:text-red-300 transition-colors"
          >
            Ignorer l'avertissement et continuer (dangereux)
          </button>
        </div>
      </div>
    </div>
  );
}
