const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo (npm workspaces) : packages/mobile dépend de @keep/music
// (packages/music), symlinké dans node_modules par `npm install` à la
// racine. Metro doit connaître la racine du monorepo pour le résoudre.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// B4 (22/09/2026) : `expo doctor` signale "watchFolders does not contain
// all entries from Expo's defaults" -- SDK 54 detecte deja le monorepo et
// pre-remplit watchFolders/nodeModulesPaths dans getDefaultConfig(). Le
// code precedent ECRASAIT ce tableau au lieu de l'etendre, perdant les
// entrees par defaut d'Expo. On les conserve desormais et on ajoute
// seulement la racine du monorepo si elle n'y est pas deja.
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
config.resolver.nodeModulesPaths = Array.from(new Set([
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]));
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
