const fs = require('fs');

async function checkSettings(args) {
  const settingsPath = args.settingsPath || './.reactor-settings.json';
  try {
    await fs.promises.access(settingsPath);
    return JSON.parse(await fs.promises.readFile(settingsPath, 'utf8'));
  } catch (e) {
    throw new Error(`Launch Sync settings file at: ${settingsPath} does not exist.`);
  }
}

function checkEnvironment(settings) {
  if (!settings.environment) {
    console.error('No "environment" property.');
  }
  if (!settings.environment.reactorUrl) {
    console.error('No "environment.reactorUrl" property.');
  }
  return settings.environment;
}

async function checkArgs(args) {
  const settings = await checkSettings(args);
  checkEnvironment(settings);
  return settings;
}

module.exports = checkArgs;