import { describe, it, expect } from 'vitest';
import { isWeakPassword, splitPwnedHash, countInPwnedRange, sha1Hex } from '../password-tools';

describe('isWeakPassword', () => {
  it('flags short, common and repetitive passwords', () => {
    for (const weak of ['abc', '123456', 'Password', 'aaaaaaaaaaaa', 'motdepasse', 'alllowercase']) {
      expect(isWeakPassword(weak)).toBe(true);
    }
  });

  it('accepts long passwords mixing character kinds, and very long passphrases', () => {
    expect(isWeakPassword('Tr0ub4dor&3xtra')).toBe(false);
    expect(isWeakPassword('correct horse battery staple')).toBe(false);
  });
});

describe('Have I Been Pwned range helpers', () => {
  it('hashes with SHA-1 and splits into a 5-character prefix and the rest', () => {
    expect(sha1Hex('password')).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
    expect(splitPwnedHash('password')).toEqual({ prefix: '5BAA6', suffix: '1E4C9B93F3F0682250B6CF8331B7EE68FD8' });
  });

  it('finds the count of a matching suffix and ignores padding entries', () => {
    const body = '0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0';
    expect(countInPwnedRange(body, '1E4C9B93F3F0682250B6CF8331B7EE68FD8')).toBe(9545824);
    expect(countInPwnedRange(body, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(0);
    expect(countInPwnedRange(body, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(0);
  });
});
