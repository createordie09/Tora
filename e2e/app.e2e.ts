import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import electronPath from 'electron';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

let app: ElectronApplication;
let page: Page;
let server: http.Server;
let serverPort = 0;
let dataDir = '';

async function openAddress(target: string) {
  const omnibox = page.getByRole('combobox', { name: 'Adresse web ou recherche' });
  await omnibox.click();
  await omnibox.fill(target);
  await omnibox.press('Enter');
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const title = req.url?.startsWith('/seconde') ? 'Seconde page E2E' : 'Page de test E2E';
    res.end(`<!doctype html><title>${title}</title><h1>Bonjour</h1>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  serverPort = (server.address() as AddressInfo).port;

  dataDir = mkdtempSync(path.join(tmpdir(), 'tora-e2e-'));
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, TORA_USER_DATA: dataDir, NODE_ENV: 'production' },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

afterAll(async () => {
  await app?.close().catch(() => {});
  await new Promise<void>(resolve => server.close(() => resolve()));
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp folder: best effort */ }
});

describe('Tora (application complète)', () => {
  it('démarre sur la page Nouvel onglet', async () => {
    await expect(page.getByRole('heading', { name: 'Tora', level: 1 }).waitFor({ state: 'visible' })).resolves.toBeUndefined();
    expect(await page.getByRole('tab').count()).toBe(1);
  });

  it('ouvre un serveur local en http et signale la connexion non sécurisée', async () => {
    await openAddress(`127.0.0.1:${serverPort}`);
    await page.getByRole('tab', { name: /Page de test E2E/ }).waitFor({ state: 'visible' });
    const lock = page.getByRole('img', { name: /non sécurisée/ });
    await lock.waitFor({ state: 'visible' });
    expect(await page.getByRole('combobox', { name: 'Adresse web ou recherche' }).inputValue()).toBe(`http://127.0.0.1:${serverPort}/`);
  });

  it('ouvre les pages internes depuis la barre d’adresse (tora://settings)', async () => {
    await openAddress('tora://settings');
    await page.getByRole('heading', { name: 'Paramètres', level: 1 }).waitFor({ state: 'visible' });
    await expect(page.getByLabel('Moteur de recherche').inputValue()).resolves.toBe('duckduckgo');
  });

  it('affiche la page À propos avec la version et les licences', async () => {
    await openAddress('tora://about');
    await page.getByText('Version 1.0.0').waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'Licences et sources' }).waitFor({ state: 'visible' });
    await page.getByText(/ne sont disponibles que dans la version installée/).waitFor({ state: 'visible' });
  });

  it('retire les paramètres de suivi des adresses et l’indique dans le panneau de protections', async () => {
    await openAddress(`127.0.0.1:${serverPort}/?utm_source=news&id=7&fbclid=abc`);
    const omnibox = page.getByRole('combobox', { name: 'Adresse web ou recherche' });
    await expect.poll(() => omnibox.inputValue()).toBe(`http://127.0.0.1:${serverPort}/?id=7`);

    await page.getByRole('button', { name: /^Protections de Tora/ }).click();
    const panel = page.getByRole('dialog', { name: /Protections de Tora sur ce site/ });
    await panel.waitFor({ state: 'visible' });
    await expect(panel.getByText('Paramètres de suivi retirés').locator('xpath=following-sibling::span').innerText()).resolves.toBe('2');
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached' });
  });

  it('ouvre un onglet dans un conteneur isolé et l’indique', async () => {
    await page.getByRole('button', { name: 'Menu principal' }).click();
    await page.getByRole('button', { name: /Nouvel onglet — Travail/ }).click();
    await page.getByRole('tab', { name: /conteneur Travail/ }).waitFor({ state: 'visible' });
    await page.getByTitle(/ses propres cookies/).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Fermer l'onglet/ }).last().click();
  });

  it('rouvre un onglet fermé depuis le menu', async () => {
    // (closing the last tab would close the window, so work in a second tab)
    await page.getByRole('button', { name: 'Ouvrir un nouvel onglet' }).click();
    await expect.poll(() => page.getByRole('tab').count()).toBe(2);
    await openAddress(`127.0.0.1:${serverPort}/seconde`);
    await page.getByRole('tab', { name: /Seconde page E2E/ }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Fermer l'onglet Seconde page E2E/ }).click();
    await page.getByRole('tab', { name: /Seconde page E2E/ }).waitFor({ state: 'detached' });

    await page.getByRole('button', { name: 'Menu principal' }).click();
    await page.getByRole('button', { name: /Rouvrir l'onglet fermé/ }).click();
    await page.getByRole('tab', { name: /Seconde page E2E/ }).waitFor({ state: 'visible' });
  });

  it('gère les onglets depuis leur menu (épingler, dupliquer, fermer les autres)', async () => {
    const tabs = page.getByRole('tab');
    await expect.poll(() => tabs.count()).toBe(2);

    await tabs.first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Épingler' }).click();
    await expect.poll(() => page.getByRole('tab', { name: /\(épinglé\)/ }).count()).toBe(1);
    // the pinned tab stays first
    await expect.poll(() => tabs.first().getAttribute('aria-label')).toMatch(/\(épinglé\)/);

    await tabs.last().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Dupliquer' }).click();
    await expect.poll(() => tabs.count()).toBe(3);

    await tabs.last().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Fermer les autres onglets' }).click();
    await expect.poll(() => tabs.count()).toBe(2); // the pinned tab is kept
    await expect.poll(() => tabs.first().getAttribute('aria-label')).toMatch(/\(épinglé\)/);
  });

  it('ouvre une fenêtre privée clairement signalée', async () => {
    // Playwright also lists the page views of tabs as "windows": only Tora's own interface pages count.
    const interfaceWindows = () => app.windows().filter(w => w.url().endsWith('/dist/index.html'));
    const before = interfaceWindows().length;
    await page.getByRole('button', { name: 'Menu principal' }).click();
    await page.getByRole('button', { name: /Nouvelle fenêtre privée/ }).click();
    await expect.poll(() => interfaceWindows().length, { timeout: 15_000 }).toBeGreaterThan(before);
    const privateWindow = interfaceWindows().find(w => w !== page)!;
    await privateWindow.waitForLoadState('domcontentloaded');
    await expect.poll(() => privateWindow.locator('body').innerText(), { timeout: 20_000 }).toContain('Navigation privée');
  });
});
