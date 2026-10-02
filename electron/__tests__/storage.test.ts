import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonStore } from '../storage';

let dir: string;
let errors: string[];
let saveErrors: string[];

const quietLog = { error: (...a: any[]) => errors.push(a.map(String).join(' ')), warn: () => {} };

function makeStore() {
  return new JsonStore({ getDir: () => dir, log: quietLog, onSaveError: f => saveErrors.push(f) });
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tora-store-'));
  errors = [];
  saveErrors = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('JsonStore', () => {
  it('returns the fallback for a file that does not exist yet', async () => {
    expect(await makeStore().read('missing.json', { a: 1 })).toEqual({ a: 1 });
    expect(errors).toHaveLength(0);
  });

  it('saves and reads back data', async () => {
    const store = makeStore();
    await store.save('data.json', { list: [1, 2, 3] });
    expect(await store.read('data.json', null)).toEqual({ list: [1, 2, 3] });
    expect(readdirSync(dir)).not.toContain('data.json.tmp');
  });

  it('keeps every overlapping save of the same file intact and ends on the last one', async () => {
    const store = makeStore();
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.save('history.json', { version: i })));
    expect(await store.read('history.json', null)).toEqual({ version: 24 });
    expect(saveErrors).toHaveLength(0);
  });

  it('snapshots the data at call time', async () => {
    const store = makeStore();
    const data = { items: ['a'] };
    const pending = store.save('snap.json', data);
    data.items.push('b');
    await pending;
    expect(await store.read('snap.json', null)).toEqual({ items: ['a'] });
  });

  it('sets a corrupted file aside instead of discarding it, and restores the backup', async () => {
    const store = makeStore();
    await store.save('bookmarks.json', { good: 'v1' });
    await store.save('bookmarks.json', { good: 'v2' }); // creates bookmarks.json.bak = v1
    writeFileSync(path.join(dir, 'bookmarks.json'), '{ not json');

    expect(await store.read('bookmarks.json', { good: 'default' })).toEqual({ good: 'v1' });
    const aside = readdirSync(dir).filter(f => f.startsWith('bookmarks.json.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(readFileSync(path.join(dir, aside[0]), 'utf8')).toBe('{ not json');
  });

  it('falls back to the default when both the file and its backup are unusable', async () => {
    const store = makeStore();
    writeFileSync(path.join(dir, 'settings.json'), 'garbage');
    expect(await store.read('settings.json', { ok: true })).toEqual({ ok: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reports a failed save once, without throwing', async () => {
    const store = new JsonStore({ getDir: () => path.join(dir, 'does', 'not', 'exist'), log: quietLog, onSaveError: f => saveErrors.push(f) });
    await expect(store.save('x.json', {})).resolves.toBeUndefined();
    await store.save('y.json', {});
    expect(saveErrors).toEqual(['x.json']); // throttled to one notification per minute
  });
});
