import { describe, it, expect } from 'vitest';
import {
  getRegistrableDomain,
  isInternalUrl,
  isInternalOrEmpty,
  sanitizeNavigationUrl,
  isSafeFilePath,
  isLocalOrPrivateHost,
  isSafeRemoteDownloadUrl,
  escapeHtml,
} from '../url-utils';

describe('url-utils security test suite', () => {
  describe('getRegistrableDomain', () => {
    it('should extract hostname without www', () => {
      expect(getRegistrableDomain('https://www.example.com/path')).toBe('example.com');
      expect(getRegistrableDomain('http://sub.domain.org')).toBe('sub.domain.org');
    });

    it('should return null for invalid URLs', () => {
      expect(getRegistrableDomain('invalid-url')).toBeNull();
    });
  });

  describe('isInternalUrl & isInternalOrEmpty', () => {
    it('should identify tora:// scheme URLs correctly', () => {
      expect(isInternalUrl('tora://settings')).toBe(true);
      expect(isInternalUrl('https://tora.io')).toBe(false);
      expect(isInternalOrEmpty('')).toBe(true);
      expect(isInternalOrEmpty('tora://history')).toBe(true);
    });
  });

  describe('sanitizeNavigationUrl', () => {
    it('should block dangerous javascript: URLs', () => {
      const result = sanitizeNavigationUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.url).toBe('about:blank');
    });

    it('should format domain names with https://', () => {
      const result = sanitizeNavigationUrl('github.com');
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://github.com');
    });

    it('should convert raw text into a search query', () => {
      const result = sanitizeNavigationUrl('electron security best practices');
      expect(result.valid).toBe(true);
      expect(result.url).toContain('duckduckgo.com/?q=electron');
    });

    it('treats empty input and about:blank as the new-tab page', () => {
      expect(sanitizeNavigationUrl('')).toEqual({ valid: true, url: '' });
      expect(sanitizeNavigationUrl('about:blank')).toEqual({ valid: true, url: '' });
    });

    it('keeps tora:// pages internal', () => {
      expect(sanitizeNavigationUrl('tora://settings').url).toBe('tora://settings');
    });

    it('uses http for localhost and private IPs', () => {
      expect(sanitizeNavigationUrl('localhost:3000').url).toBe('http://localhost:3000');
      expect(sanitizeNavigationUrl('192.168.1.1').url).toBe('http://192.168.1.1');
      expect(sanitizeNavigationUrl('127.0.0.1:8080/app').url).toBe('http://127.0.0.1:8080/app');
    });

    it('keeps paths and queries on domains', () => {
      expect(sanitizeNavigationUrl('example.com/a?b=1').url).toBe('https://example.com/a?b=1');
    });

    it('refuses dangerous or unsupported schemes', () => {
      for (const bad of ['data:text/html,<h1>x</h1>', 'file:///C:/secret.txt', 'vbscript:x', 'chrome://settings', 'ssh://host']) {
        expect(sanitizeNavigationUrl(bad).valid).toBe(false);
      }
    });

    it('lets the search engine be chosen', () => {
      expect(sanitizeNavigationUrl('tora navigateur', 'google').url).toBe('https://www.google.com/search?q=tora%20navigateur');
      expect(sanitizeNavigationUrl('tora navigateur', 'unknown').url).toContain('duckduckgo.com');
    });
  });

  describe('isLocalOrPrivateHost', () => {
    it('detects local and private hosts', () => {
      for (const h of ['localhost', 'app.localhost', 'nas.local', '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.0.10', '169.254.1.1', '[::1]']) {
        expect(isLocalOrPrivateHost(h)).toBe(true);
      }
    });

    it('does not flag public hosts', () => {
      for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '192.169.0.1', '11.0.0.1']) {
        expect(isLocalOrPrivateHost(h)).toBe(false);
      }
    });
  });

  describe('isSafeRemoteDownloadUrl & escapeHtml', () => {
    it('accepts only public http(s) URLs', () => {
      expect(isSafeRemoteDownloadUrl('https://cdn.example.com/v.mp4')).toBe(true);
      expect(isSafeRemoteDownloadUrl('http://192.168.1.2/v.mp4')).toBe(false);
      expect(isSafeRemoteDownloadUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeRemoteDownloadUrl('nonsense')).toBe(false);
    });

    it('escapes HTML', () => {
      expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    });
  });

  describe('isSafeFilePath', () => {
    it('should allow files inside base directory', () => {
      expect(isSafeFilePath('/downloads', '/downloads/file.pdf')).toBe(true);
    });

    it('should block directory traversal paths', () => {
      expect(isSafeFilePath('/downloads', '/downloads/../etc/passwd')).toBe(false);
    });

    it('blocks sibling directories sharing a prefix', () => {
      expect(isSafeFilePath('/downloads', '/downloads-evil/file.pdf')).toBe(false);
    });

    it('does not treat the base directory itself as a file inside it', () => {
      expect(isSafeFilePath('/downloads', '/downloads')).toBe(false);
    });
  });
});
