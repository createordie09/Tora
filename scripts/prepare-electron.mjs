// Compiles the Electron main process into a clean dist-electron/ folder.
// The folder is emptied first so files that no longer exist in the sources (renamed or
// deleted modules) can never be shipped by accident.
import { rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

rmSync('dist-electron', { recursive: true, force: true });
execSync('npx tsc -p electron', { stdio: 'inherit' });
mkdirSync('dist-electron', { recursive: true });
copyFileSync('electron/package.json', 'dist-electron/package.json');
console.log('dist-electron ready');
