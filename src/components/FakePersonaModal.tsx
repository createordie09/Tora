import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, UserCheck, RotateCw, KeyRound, Mail, User } from 'lucide-react';
import { FakePersona } from '../types';
import { popIn } from '../lib/motion';
import { useModalA11y } from '../hooks/useModalA11y';

interface FakePersonaModalProps {
  persona: FakePersona | null;
  onClose: () => void;
  onRegenerate: () => void;
}

export default function FakePersonaModal({ persona, onClose, onRegenerate }: FakePersonaModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, !!persona, onClose);

  if (!persona) return null;

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const copyAll = () => {
    const fullText = `Identité fictive Tora:
Nom: ${persona.fullName}
Nom d'utilisateur: ${persona.username}
Email: ${persona.email}
Mot de passe: ${persona.password}`;
    navigator.clipboard.writeText(fullText);
    setCopiedField('all');
    setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
        <motion.div
          {...popIn}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="persona-modal-title"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-[#121216]/95 border border-white/10 rounded-2xl shadow-2xl p-6 text-ink backdrop-blur-2xl relative"
        >
          <button
            type="button"
            aria-label="Fermer la fenêtre"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-muted hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400" aria-hidden="true">
              <UserCheck size={20} />
            </div>
            <div>
              <h2 id="persona-modal-title" className="text-[16px] font-semibold text-white">Identité Fictive (Ghost Persona)</h2>
              <p className="text-[12px] text-muted">Identité éphémère pour formulaires et inscriptions</p>
            </div>
          </div>

          <div className="space-y-2.5 my-4">
            {/* Nom */}
            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <User size={15} className="text-muted shrink-0" />
                <div className="text-left overflow-hidden">
                  <div className="text-[10px] text-muted uppercase font-semibold">Nom complet</div>
                  <div className="text-[13px] text-white font-medium truncate">{persona.fullName}</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Copier le nom"
                onClick={() => copyToClipboard(persona.fullName, 'name')}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors shrink-0"
                title="Copier le nom"
              >
                {copiedField === 'name' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <Mail size={15} className="text-muted shrink-0" />
                <div className="text-left overflow-hidden">
                  <div className="text-[10px] text-muted uppercase font-semibold">Adresse email jetable</div>
                  <div className="text-[13px] text-indigo-300 font-mono truncate">{persona.email}</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Copier l'adresse email"
                onClick={() => copyToClipboard(persona.email, 'email')}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors shrink-0"
                title="Copier l'email"
              >
                {copiedField === 'email' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>

            {/* Password */}
            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <KeyRound size={15} className="text-muted shrink-0" />
                <div className="text-left overflow-hidden">
                  <div className="text-[10px] text-muted uppercase font-semibold">Mot de passe fort généré</div>
                  <div className="text-[13px] text-emerald-400 font-mono truncate">{persona.password}</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Copier le mot de passe"
                onClick={() => copyToClipboard(persona.password, 'password')}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors shrink-0"
                title="Copier le mot de passe"
              >
                {copiedField === 'password' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onRegenerate}
              aria-label="Régénérer une nouvelle identité fictive"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[12px] font-medium text-ink hover:text-white transition-colors"
            >
              <RotateCw size={13} />
              <span>Régénérer</span>
            </button>
            <button
              type="button"
              onClick={copyAll}
              aria-label="Copier toutes les informations"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[12px] font-medium text-white transition-colors shadow-lg shadow-indigo-600/20"
            >
              {copiedField === 'all' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedField === 'all' ? 'Tout copié !' : 'Copier tout'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
