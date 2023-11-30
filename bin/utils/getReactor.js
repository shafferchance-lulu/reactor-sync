const Reactor = require('@adobe/reactor-sdk').default;

/**
 * 
 * @param {import('..').ReactorSettingsWithSDK} settings 
 * @returns 
 */
async function getReactor(settings) {
  if (!settings.reactor)
    return await new Reactor(settings.accessToken, {
      reactorUrl: settings.environment.reactorUrl,
      enableLogging: false // turn true to help debug
    });
  return settings.reactor;
}

module.exports = getReactor;