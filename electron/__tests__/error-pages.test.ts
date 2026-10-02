import { describe, it, expect } from 'vitest';
import { buildErrorPage, certErrorMessage, ERROR_MESSAGES } from '../error-pages';

describe('buildErrorPage', () => {
  it('shows the friendly title and message for known errors', () => {
    const html = buildErrorPage('https://exemple.test/', -106, 'ERR_INTERNET_DISCONNECTED');
    expect(html).toContain(ERROR_MESSAGES['-106'].title);
    expect(html).toContain('<html lang="fr">');
  });

  it('never injects the address or the error text as HTML', () => {
    const html = buildErrorPage('https://x.test/"><script>alert(1)</script>', -999, '<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)');
  });

  it('offers a retry button that only follows http(s) addresses', () => {
    const html = buildErrorPage('https://exemple.test/page', -105, 'ERR_NAME_NOT_RESOLVED');
    expect(html).toContain('id="retry"');
    expect(html).toContain('data-url="https://exemple.test/page"');
    expect(html).toContain('https?:');
  });
});

describe('certErrorMessage', () => {
  it('explains the common certificate problems', () => {
    expect(certErrorMessage(-200)).toMatch(/nom de ce site/);
    expect(certErrorMessage(-201)).toMatch(/expiré/);
    expect(certErrorMessage(-202)).toMatch(/autorité de confiance/);
    expect(certErrorMessage(-299)).toMatch(/n'a pas pu être vérifié/);
  });
});
