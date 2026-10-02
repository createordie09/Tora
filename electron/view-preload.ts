import { ipcRenderer, webFrame } from 'electron';

// Read current settings synchronously — this preload runs before any page script, so we
// need the value immediately rather than waiting on an async round trip.
const initialSettings = ipcRenderer.sendSync('get-settings-sync') || {};

// ===== Universal Invisible Scrollbar =====
// Hides scrollbars across 100% of websites without disabling scrolling functionality
try {
  webFrame.insertCSS(`
    ::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    html, body {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
  `);
} catch (e) {}

// ===== Anti-fingerprinting =====
// Canvas and WebGL are the two most common fingerprinting vectors: sites render an
// invisible image or query GPU parameters and hash the exact pixel/parameter output,
// which is stable enough per-device to identify a user without cookies. We inject a
// small, per-page-load random noise into these APIs' outputs — enough to break exact
// cross-site matching, small enough not to visibly affect legitimate use (charts,
// canvas games, WebGL rendering all still work normally).
if (initialSettings.isFingerprintProtectionEnabled) {
  const seed = Math.floor(Math.random() * 4294967296);
  const protectionScript = `(() => {
    const seed = ${seed};
    let s = seed;
    function rand() {
      // Deterministic per-page-load PRNG (mulberry32) — same page reload keeps behaving
      // consistently within a session, but a different session/site gets different noise.
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    try {
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        const imageData = origGetImageData.apply(this, args);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const n = Math.floor(rand() * 3) - 1; // -1, 0, or 1
          data[i] = Math.min(255, Math.max(0, data[i] + n));
        }
        return imageData;
      };

      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const ctx = this.getContext('2d');
        if (ctx) {
          try {
            const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const n = Math.floor(rand() * 3) - 1;
              data[i] = Math.min(255, Math.max(0, data[i] + n));
            }
            ctx.putImageData(imageData, 0, 0);
          } catch (e) {}
        }
        return origToDataURL.apply(this, args);
      };
    } catch (e) {}

    try {
      const spoofedParams = { 37445: 'Google Inc. (Generic)', 37446: 'ANGLE (Generic Renderer)' };
      [WebGLRenderingContext, (window as any).WebGL2RenderingContext].forEach((Ctx) => {
        if (!Ctx) return;
        const origGetParameter = Ctx.prototype.getParameter;
        Ctx.prototype.getParameter = function(param) {
          if (param in spoofedParams) return spoofedParams[param];
          return origGetParameter.call(this, param);
        };
      });
    } catch (e) {}

    try {
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function(...args) {
        const data = origGetChannelData.apply(this, args);
        // Only perturb a handful of samples — enough to change an audio fingerprint hash,
        // negligible enough to be inaudible for real playback/analysis use cases.
        for (let i = 0; i < data.length; i += 100) {
          data[i] = data[i] + (rand() - 0.5) * 0.0001;
        }
        return data;
      };
    } catch (e) {}
  })();`;
  webFrame.executeJavaScript(protectionScript);
}

let lastPing = 0;

const ping = () => {
  const now = Date.now();
  if (now - lastPing > 200) {
    ipcRenderer.send('user-gesture-ping');
    lastPing = now;
  }
};

// Use capturing phase to ensure we catch it before any page scripts stop propagation
window.addEventListener('click', ping, true);
window.addEventListener('keydown', ping, true);
window.addEventListener('touchstart', ping, true);

// ===== Password manager: form detection, save-candidate capture, autofill =====

type CredentialMatch = { id: string; username: string };

let availableCredentials: CredentialMatch[] = [];
const autofilledForms = new WeakSet<HTMLFormElement>();

function isVisible(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function findPasswordField(): HTMLInputElement | null {
  const fields = Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
  return fields.find(isVisible) || null;
}

function findUsernameField(passwordField: HTMLInputElement): HTMLInputElement | null {
  const form = passwordField.closest('form');
  const scope: ParentNode = form || document;
  const candidates = (Array.from(scope.querySelectorAll('input')) as HTMLInputElement[])
    .filter(el => {
      const type = (el.type || 'text').toLowerCase();
      return (type === 'email' || type === 'text') && isVisible(el);
    });
  if (candidates.length === 0) return null;

  const idx = candidates.findIndex(el => {
    // pick the candidate closest before the password field in DOM order
    return el.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  return idx !== -1 ? candidates[idx] : candidates[0];
}

// Sets a form field's value the way a real user typing would, so frameworks like
// React/Vue that track input via their own synthetic events still pick up the change.
function setNativeValue(el: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function attachPasswordFillOnFocus(pwField: HTMLInputElement, credentialId: string) {
  const handler = async () => {
    if (pwField.value) return;
    try {
      const result = await ipcRenderer.invoke('request-credential-fill', credentialId);
      if (result?.password) setNativeValue(pwField, result.password);
    } catch (err) {}
  };
  pwField.addEventListener('focus', handler, { once: true });
}

// Minimal, dependency-free suggestion dropdown for when several saved logins match the
// current site — styled with inline styles since this script has no access to the app's
// Tailwind context (it runs inside the visited page, not inside Tora's own UI).
function attachSuggestionDropdown(userField: HTMLInputElement, pwField: HTMLInputElement, creds: CredentialMatch[]) {
  let dropdown: HTMLDivElement | null = null;

  const close = () => {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  };

  const open = () => {
    close();
    const rect = userField.getBoundingClientRect();
    dropdown = document.createElement('div');
    Object.assign(dropdown.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.bottom + 4}px`,
      zIndex: '2147483647',
      background: '#1A1A1A',
      border: '1px solid #333333',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      color: '#E5E5E5',
      overflow: 'hidden',
      minWidth: `${Math.max(rect.width, 200)}px`,
    });

    creds.forEach(c => {
      const item = document.createElement('div');
      item.textContent = c.username;
      Object.assign(item.style, { padding: '8px 12px', cursor: 'pointer' });
      item.addEventListener('mouseenter', () => { item.style.background = '#2A2A2A'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('mousedown', async (ev) => {
        ev.preventDefault();
        setNativeValue(userField, c.username);
        try {
          const result = await ipcRenderer.invoke('request-credential-fill', c.id);
          if (result?.password) setNativeValue(pwField, result.password);
        } catch (err) {}
        close();
      });
      dropdown!.appendChild(item);
    });

    document.body.appendChild(dropdown);
  };

  userField.addEventListener('focus', open);
  userField.addEventListener('blur', () => setTimeout(close, 150));
}

function tryAutofill() {
  if (availableCredentials.length === 0) return;
  const pwField = findPasswordField();
  if (!pwField) return;
  const userField = findUsernameField(pwField);
  if (!userField) return;

  const form = (pwField.closest('form') as HTMLFormElement) || document.body as unknown as HTMLFormElement;
  if (autofilledForms.has(form)) return;
  autofilledForms.add(form);

  if (availableCredentials.length === 1) {
    if (!userField.value) setNativeValue(userField, availableCredentials[0].username);
    attachPasswordFillOnFocus(pwField, availableCredentials[0].id);
  } else {
    attachSuggestionDropdown(userField, pwField, availableCredentials);
  }
}

ipcRenderer.on('available-credentials', (_event, creds: CredentialMatch[]) => {
  availableCredentials = Array.isArray(creds) ? creds : [];
  tryAutofill();
});

// Capture-phase submit listener: only fires on an actual form submission (never on
// every keystroke), and only sends { username, password } — nothing else from the form.
document.addEventListener('submit', (e) => {
  try {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const pwField = form.querySelector('input[type="password"]') as HTMLInputElement | null;
    if (!pwField || !pwField.value) return;
    const userField = findUsernameField(pwField);
    if (!userField || !userField.value) return;
    ipcRenderer.send('credential-candidate', { username: userField.value, password: pwField.value });
  } catch (err) {}
}, true);

window.addEventListener('DOMContentLoaded', () => {
  const SCAREWARE_REGEX = /(verify you are human|vous avez été sélectionné|virus detected|click allow to continue|confirmez que vous n'êtes pas un robot|your computer is infected|warning: virus)/i;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'LINK', 'META']);

  // Only ever consider elements that are cheap to inspect: fixed/absolute-positioned,
  // with a small subtree (real scareware overlays are simple, self-contained divs — never
  // large content containers like video grids, feeds, etc). This avoids calling
  // `textContent` (which walks the ENTIRE subtree) on huge dynamically-growing containers,
  // which is what was freezing heavy sites like YouTube.
  const isCandidate = (el: HTMLElement): boolean => {
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.childElementCount > 25) return false; // real overlays are shallow
    const style = window.getComputedStyle(el);
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'absolute') return false;
    const zIndex = parseInt(style.zIndex || '0', 10);
    if (zIndex <= 9000) return false;
    return true;
  };

  const inspect = (el: HTMLElement) => {
    try {
      if (!isCandidate(el)) return;
      // textContent is safe here because childElementCount is already capped above
      const text = el.textContent || '';
      if (text.length > 400 || !SCAREWARE_REGEX.test(text)) return;

      if (el.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]')) return;

      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.7) {
        el.style.display = 'none';
        ipcRenderer.send('scareware-blocked');
      }
    } catch (e) {}
  };

  // ===== Cookie consent auto-reject =====
  // Deliberately conservative: only acts on an UNAMBIGUOUS "reject all / refuse" labeled
  // control inside a container that also reads like a cookie banner. It never touches an
  // "accept" button — worst case if it misses a banner, the user just sees it normally,
  // same as without this feature.
  const COOKIE_BANNER_HINT = /(cookie|consent|rgpd|gdpr|vie privée|privacy)/i;
  const REJECT_TEXT = /^(reject all|refuse all|refuser tout|tout refuser|decline all|disagree|refuser|necessary only|only necessary|essential only)$/i;
  let cookieBannerHandled = false;

  const tryRejectCookieBanner = (el: HTMLElement) => {
    if (cookieBannerHandled) return;
    try {
      const text = el.textContent || '';
      if (text.length > 2000 || !COOKIE_BANNER_HINT.test(text)) return;
      const style = window.getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky' && style.position !== 'absolute') return;

      const clickable = Array.from(el.querySelectorAll('button, a, [role="button"]')) as HTMLElement[];
      const rejectBtn = clickable.find(b => REJECT_TEXT.test((b.textContent || '').trim()));
      if (rejectBtn) {
        cookieBannerHandled = true;
        rejectBtn.click();
        ipcRenderer.send('cookie-banner-rejected');
      }
    } catch (e) {}
  };

  // Batch mutations and process them on idle time instead of synchronously on every
  // single DOM insertion — sites like YouTube fire hundreds of mutations per second.
  let pending: HTMLElement[] = [];
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const batch = pending;
    pending = [];
    for (const el of batch) {
      inspect(el);
      if (initialSettings.isCookieAutoRejectEnabled) tryRejectCookieBanner(el);
    }
    tryAutofill(); // catches login forms injected dynamically by SPAs after initial load
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(flush, { timeout: 500 });
    } else {
      setTimeout(flush, 150);
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          pending.push(node as HTMLElement);
        }
      }
    }
    if (pending.length > 0) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  tryAutofill(); // initial pass in case the login form + credentials arrived before this point
});

// ===== Reading mode =====
// A simplified Readability-style heuristic: score every element by how much direct
// paragraph text it contains, pick the highest-scoring one as "the article", and render
// it in a clean, distraction-free overlay. Not as thorough as Mozilla's Readability, but
// handles the common case (blogs, news articles, docs) well without an extra dependency.
let readerModeActive = false;
let savedBodyOverflow = '';

function extractArticle(): { title: string; contentHtml: string } | null {
  const candidates = Array.from(document.querySelectorAll('article, main, div, section')) as HTMLElement[];
  let best: HTMLElement | null = null;
  let bestScore = 0;

  for (const el of candidates) {
    if (el.querySelector('article, main')) continue; // prefer the innermost real container
    const paragraphs = Array.from(el.querySelectorAll('p'));
    const score = paragraphs.reduce((sum, p) => sum + (p.textContent?.length || 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (!best || bestScore < 200) return null; // not enough article-like text on this page

  const clone = best.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, iframe, noscript, form, button, nav, aside, .ad, [class*="ad-"], [id*="ad-"]').forEach(el => el.remove());
  clone.querySelectorAll('img').forEach(img => { img.removeAttribute('width'); img.removeAttribute('height'); (img as HTMLImageElement).loading = 'lazy'; });

  const title = document.querySelector('h1')?.textContent?.trim() || document.title;
  return { title, contentHtml: clone.innerHTML };
}

function enterReaderMode() {
  const article = extractArticle();
  if (!article) {
    ipcRenderer.send('reader-mode-unavailable');
    return;
  }

  savedBodyOverflow = document.body.style.overflow;

  const overlay = document.createElement('div');
  overlay.id = '__tora_reader_overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: '#0A0A0A', color: '#E2E2E2',
    zIndex: '2147483647', overflowY: 'auto', fontFamily: 'Georgia, "Times New Roman", serif',
  } as CSSStyleDeclaration);

  overlay.innerHTML = `
    <style>
      #__tora_reader_body { max-width: 680px; margin: 0 auto; padding: 64px 24px 96px; line-height: 1.75; font-size: 18px; }
      #__tora_reader_body h1 { font-family: system-ui, sans-serif; font-size: 32px; font-weight: 600; margin-bottom: 32px; line-height: 1.3; color: #fff; }
      #__tora_reader_body p { margin: 0 0 22px; }
      #__tora_reader_body img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; }
      #__tora_reader_body a { color: #818CF8; }
      #__tora_reader_close { position: fixed; top: 20px; right: 28px; z-index: 2; background: #161616; border: 1px solid #2A2A2A; color: #A1A1A1; font-family: system-ui, sans-serif; font-size: 13px; padding: 8px 16px; border-radius: 999px; cursor: pointer; }
      #__tora_reader_close:hover { background: #202020; color: #fff; }
    </style>
    <button id="__tora_reader_close">✕ Quitter le mode lecture</button>
    <div id="__tora_reader_body"><h1></h1></div>
  `;

  overlay.querySelector('h1')!.textContent = article.title;
  overlay.querySelector('#__tora_reader_body')!.insertAdjacentHTML('beforeend', article.contentHtml);
  overlay.querySelector('#__tora_reader_close')!.addEventListener('click', exitReaderMode);

  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  readerModeActive = true;
  ipcRenderer.send('reader-mode-changed', true);
}

function exitReaderMode() {
  const overlay = document.getElementById('__tora_reader_overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = savedBodyOverflow;
  readerModeActive = false;
  ipcRenderer.send('reader-mode-changed', false);
}

ipcRenderer.on('toggle-reader-mode', () => {
  if (readerModeActive) exitReaderMode();
  else enterReaderMode();
});

// ===== Direct media download detection =====
// Deliberately scoped to media the page serves as an actual downloadable file — a real
// http(s) URL pointing at an mp4/webm/mp3/etc. This explicitly excludes `blob:` sources,
// which is what adaptive-streaming platforms (YouTube, Netflix, and similar) use for their
// encrypted/fragmented delivery. That's not a domain blocklist — it's what makes this a
// legitimate "save this file the page is serving me" feature rather than a stream-ripping
// tool: a blob: URL only exists inside that page's own JS memory and was never a
// downloadable file to begin with, so there is nothing for Tora to offer here.
if (initialSettings.isMediaDownloadEnabled !== false) {
  const processedMedia = new WeakSet<HTMLMediaElement>();
  const activeButtons = new Map<HTMLMediaElement, HTMLElement>();

  function isDirectMediaUrl(url: string): boolean {
    if (!url) return false;
    try {
      const u = new URL(url, location.href);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function collectSources(media: HTMLMediaElement): { url: string; label: string }[] {
    const sources: { url: string; label: string }[] = [];
    const seen = new Set<string>();

    const add = (url: string, hint?: string) => {
      if (!isDirectMediaUrl(url) || seen.has(url)) return;
      seen.add(url);
      let ext = 'fichier';
      try { ext = (new URL(url, location.href).pathname.split('.').pop() || 'fichier').toUpperCase(); } catch {}
      sources.push({ url, label: hint || ext });
    };

    if (media.currentSrc) add(media.currentSrc);
    if (media.src) add(media.src);
    media.querySelectorAll('source').forEach((s) => {
      const src = s.getAttribute('src');
      if (src) add(src, s.getAttribute('label') || (s.getAttribute('type') || '').split('/')[1]?.toUpperCase());
    });
    return sources;
  }

  function positionButton(btn: HTMLElement, media: HTMLMediaElement) {
    const rect = media.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 60 || rect.bottom < 0 || rect.top > window.innerHeight) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'flex';
    btn.style.top = `${rect.top + 8}px`;
    btn.style.left = `${rect.right - 40}px`;
  }

  function closeMenu() {
    document.getElementById('__tora_media_menu')?.remove();
  }

  function openMenu(btn: HTMLElement, media: HTMLMediaElement) {
    closeMenu();
    const sources = collectSources(media);
    if (sources.length === 0) return;

    const menu = document.createElement('div');
    menu.id = '__tora_media_menu';
    Object.assign(menu.style, {
      position: 'fixed',
      top: `${parseFloat(btn.style.top) + 34}px`,
      left: `${Math.max(8, parseFloat(btn.style.left) - 120)}px`,
      zIndex: '2147483647',
      background: '#1A1A1A',
      border: '1px solid #333333',
      borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      color: '#E5E5E5',
      overflow: 'hidden',
      minWidth: '160px',
    } as CSSStyleDeclaration);

    const header = document.createElement('div');
    header.textContent = 'Télécharger';
    Object.assign(header.style, { padding: '8px 12px', fontSize: '11px', color: '#888', borderBottom: '1px solid #2A2A2A' });
    menu.appendChild(header);

    sources.forEach((s) => {
      const item = document.createElement('div');
      item.textContent = s.label;
      Object.assign(item.style, { padding: '9px 12px', cursor: 'pointer' });
      item.addEventListener('mouseenter', () => { item.style.background = '#2A2A2A'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ipcRenderer.send('download-media', s.url);
        closeMenu();
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', function onDocClick(ev) {
        if (!menu.contains(ev.target as Node)) { closeMenu(); document.removeEventListener('click', onDocClick); }
      });
    }, 0);
  }

  function attachButton(media: HTMLMediaElement) {
    if (processedMedia.has(media)) return;
    if (collectSources(media).length === 0) return;
    processedMedia.add(media);

    const btn = document.createElement('div');
    btn.title = 'Télécharger';
    Object.assign(btn.style, {
      position: 'fixed',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      background: 'rgba(10,10,10,0.75)',
      border: '1px solid rgba(255,255,255,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: '2147483646',
      backdropFilter: 'blur(4px)',
    } as CSSStyleDeclaration);
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(99,102,241,0.85)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(10,10,10,0.75)'; });
    btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openMenu(btn, media); });

    document.body.appendChild(btn);
    activeButtons.set(media, btn);
    positionButton(btn, media);
  }

  function scanForMedia(root: ParentNode) {
    const els = root.querySelectorAll ? root.querySelectorAll('video, audio') : [];
    els.forEach((el) => attachButton(el as HTMLMediaElement));
  }

  window.addEventListener('DOMContentLoaded', () => {
    scanForMedia(document);

    const repositionAll = () => {
      activeButtons.forEach((btn, media) => positionButton(btn, media));
    };
    window.addEventListener('scroll', repositionAll, true);
    window.addEventListener('resize', repositionAll);

    const mediaObserver = new MutationObserver((mutations) => {
      let found = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') { attachButton(el as HTMLMediaElement); found = true; }
          else if (el.querySelector && el.querySelector('video, audio')) { scanForMedia(el); found = true; }
        }
      }
      if (found) requestAnimationFrame(repositionAll);
    });
    mediaObserver.observe(document.documentElement, { childList: true, subtree: true });
  });
}
