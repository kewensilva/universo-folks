// Metro precisa enxergar o @folks/shared (instalado via file:, fora da pasta do app). ADR 0012.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../../packages/shared')];
module.exports = config;
