const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo (npm workspaces) : packages/mobile dépend de @keep/music
// (packages/music), symlinké dans node_modules par `npm install` à la
// racine. Metro doit connaître la racine du monorepo pour le résoudre.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
