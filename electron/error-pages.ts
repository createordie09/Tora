import { escapeHtml } from './url-utils';

export const ERROR_MESSAGES: Record<string, { title: string; message: string }> = {
  '-2': { title: 'Échec de connexion', message: "La connexion à ce site a échoué." },
  '-6': { title: 'Fichier introuvable', message: "L'adresse demandée n'existe pas." },
  '-7': { title: 'Délai dépassé', message: "Le site a mis trop de temps à répondre." },
  '-100': { title: 'Connexion fermée', message: "Le site a fermé la connexion de manière inattendue." },
  '-101': { title: 'Connexion réinitialisée', message: "La connexion au site a été réinitialisée." },
  '-105': { title: 'Adresse introuvable', message: "Impossible de résoudre l'adresse de ce site — vérifiez l'orthographe ou votre connexion." },
  '-106': { title: 'Pas de connexion Internet', message: "Tora n'arrive pas à joindre Internet. Vérifiez votre connexion réseau." },
  '-110': { title: 'Délai de connexion dépassé', message: "La connexion au site a expiré." },
  '-200': { title: 'Certificat de sécurité invalide', message: "Ce site présente un certificat de sécurité non valide. Tora a bloqué l'accès par précaution." },
  '-202': { title: 'Certificat expiré', message: "Le certificat de sécurité de ce site a expiré." },
};

export function certErrorMessage(code: number): string {
  switch (code) {
    case -200: return "Le nom de ce site ne correspond pas à celui de son certificat de sécurité.";
    case -201: return "Le certificat de ce site est expiré ou pas encore valide. Vérifiez aussi la date et l'heure de votre ordinateur.";
    case -202: return "Le certificat de ce site n'a pas été émis par une autorité de confiance (il peut être auto-signé).";
    case -208: case -207: return "Le certificat de ce site utilise une signature trop faible ou invalide.";
    default: return "Le certificat de sécurité de ce site n'a pas pu être vérifié.";
  }
}

export function buildErrorPage(url: string, errorCode: number, errorDescription: string): string {
  const info = ERROR_MESSAGES[String(errorCode)] || { title: 'Impossible de charger la page', message: errorDescription || 'Une erreur inconnue est survenue.' };
  const title = escapeHtml(info.title);
  const message = escapeHtml(info.message);
  const safeUrl = escapeHtml(url);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{background:#050505;color:#E5E5E5;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:0 24px;}
    .icon{width:56px;height:56px;border-radius:16px;background:#161616;border:1px solid #5A5A5A;display:flex;align-items:center;justify-content:center;margin-bottom:24px;}
    h1{font-size:18px;font-weight:600;margin:0 0 8px;color:#fff;}
    p{color:#A1A1A1;max-width:440px;line-height:1.6;font-size:14px;margin:0 0 4px;}
    .url{color:#949494;font-size:12px;margin-top:12px;font-family:monospace;word-break:break-all;max-width:480px;}
    button{margin-top:24px;font:inherit;font-size:13px;font-weight:500;padding:9px 18px;border-radius:8px;border:1px solid #5A5A5A;background:#161616;color:#E5E5E5;cursor:pointer;}
    button:hover{background:#222;color:#fff;}
    button:focus-visible{outline:2px solid #818cf8;outline-offset:2px;}
  </style>
  </head><body>
  <div class="icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A1A1A1" stroke-width="1.8"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>
  <h1>${title}</h1>
  <p>${message}</p>
  <div class="url">${safeUrl}</div>
  <button type="button" id="retry" data-url="${safeUrl}">Réessayer</button>
  <script>document.getElementById('retry').addEventListener('click',function(){var u=this.getAttribute('data-url');if(/^https?:\/\//i.test(u)){location.href=u;}else{location.reload();}});</script>
  </body></html>`;
}
