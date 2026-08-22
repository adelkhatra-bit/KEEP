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

// Force CJS resolution (no `import.meta`) even for the web target: some
// packages (e.g. zustand) ship an ESM build gated behind the "import"
// condition that references `import.meta.env`, which crashes when Metro
// serves it as a classic (non-module) <script> for expo web.
config.resolver.unstable_conditionNames = ['require', 'react-native', 'browser'];

module.exports = config;
