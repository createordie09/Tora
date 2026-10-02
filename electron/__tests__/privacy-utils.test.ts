import { describe, it, expect } from 'vitest';
import {
  cleanTrackingParams,
  getSiteKey,
  isThirdPartyRequest,
  trimReferrer,
  parseHostsFile,
  parseUrlFeed,
} from '../privacy-utils';

describe('cleanTrackingParams', () => {
  it('removes utm_* and click identifiers but keeps everything else untouched', () => {
    const result = cleanTrackingParams('https://shop.example/p?id=42&utm_source=news&fbclid=abc&color=red%20blue#reviews');
    expect(result.url).toBe('https://shop.example/p?id=42&color=red%20blue#reviews');
    expect(result.removed).toBe(2);
  });

  it('drops the question mark when only tracking parameters remain', () => {
    expect(cleanTrackingParams('https://a.example/?gclid=1&utm_medium=x').url).toBe('https://a.example/');
  });

  it('returns the same URL when there is nothing to clean', () => {
    const url = 'https://a.example/path?q=tora&page=2';
    expect(cleanTrackingParams(url)).toEqual({ url, removed: 0 });
    expect(cleanTrackingParams('https://a.example/')).toEqual({ url: 'https://a.example/', removed: 0 });
  });

  it('does not touch non-web URLs and is case-insensitive on names', () => {
    expect(cleanTrackingParams('tora://settings?utm_source=x').removed).toBe(0);
    expect(cleanTrackingParams('https://a.example/?UTM_Source=x&FBCLID=1').url).toBe('https://a.example/');
  });
});

describe('site and third-party detection', () => {
  it('computes the site of a host', () => {
    expect(getSiteKey('www.example.com')).toBe('example.com');
    expect(getSiteKey('a.b.example.co.uk')).toBe('example.co.uk');
    expect(getSiteKey('localhost')).toBe('localhost');
    expect(getSiteKey('192.168.0.1')).toBe('192.168.0.1');
  });

  it('flags only cross-site requests as third-party', () => {
    expect(isThirdPartyRequest('https://cdn.example.com/a.js', 'https://www.example.com/')).toBe(false);
    expect(isThirdPartyRequest('https://tracker.ads.net/p.gif', 'https://www.example.com/')).toBe(true);
    expect(isThirdPartyRequest('https://other.co.uk/x', 'https://shop.example.co.uk/')).toBe(true);
    expect(isThirdPartyRequest('https://a.example/x', 'tora://settings')).toBe(false);
  });

  it('trims referrers to the origin', () => {
    expect(trimReferrer('https://site.example/private/page?token=1')).toBe('https://site.example/');
    expect(trimReferrer('not a url')).toBe('not a url');
  });
});

describe('threat feed parsers', () => {
  it('parses hosts files, ignoring comments and localhost', () => {
    const text = '# comment\n127.0.0.1 localhost\n127.0.0.1 Evil.Example # trailing\n0.0.0.0 bad.test\n\nnot a host line here';
    expect(parseHostsFile(text)).toEqual(['evil.example', 'bad.test']);
  });

  it('extracts unique hosts from a URL feed and ignores raw IPs', () => {
    const text = 'https://phish.example/login\nhttp://phish.example/other\nhttp://1.2.3.4/x\ngarbage\nhttps://Another.Bad.Site/a';
    expect(parseUrlFeed(text)).toEqual(['phish.example', 'another.bad.site']);
  });
});
