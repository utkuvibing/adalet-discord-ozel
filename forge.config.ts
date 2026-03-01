import path from 'node:path';
import fs from 'node:fs';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import type { ForgeConfig } from '@electron-forge/shared-types';

/**
 * Native modules that Vite marks as external (require() at runtime).
 * These must be copied into the packaged app's node_modules so Electron can find them.
 */
const NATIVE_MODULES = [
  'better-sqlite3',
  'bindings',
  'file-uri-to-path',
  'prebuild-install',
];

/** Recursively copy a directory. */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{better-sqlite3,bindings,file-uri-to-path,prebuild-install}/**',
    },
    name: 'Sex Dungeon',
    executableName: 'sex-dungeon',
    icon: './resources/app-icon',
    extraResources: [{ from: './drizzle', to: 'drizzle' }],
  },
  rebuildConfig: {
    onlyModules: ['better-sqlite3'],
    force: true,
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy native modules into the packaged app so require() can find them
      const srcNodeModules = path.resolve(__dirname, 'node_modules');
      const destNodeModules = path.join(buildPath, 'node_modules');

      for (const mod of NATIVE_MODULES) {
        const src = path.join(srcNodeModules, mod);
        const dest = path.join(destNodeModules, mod);
        if (fs.existsSync(src)) {
          copyDirSync(src, dest);
          console.log(`[hook] Copied ${mod} to package`);
        }
      }
    },
  },
  makers: [new MakerSquirrel({ name: 'SexDungeon' })],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.mts' },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;
