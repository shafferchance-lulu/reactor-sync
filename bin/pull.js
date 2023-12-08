const ora = import('ora');
const writeResources = require('./utils/writeResources');
const checkAccessToken = require('./utils/getAccessToken');
const checkArgs = require('./utils/checkArgs');
const getReactor = require('./utils/getReactor');
const ensureDirectory = require('./utils/ensureDirectory');
const resourceTypes = ['data_elements', 'property', 'extensions', 'rules', 'rule_components', 'environments'];


async function startSpinner() {
  const spinner = await ora.then(mod => mod.default('Pulling Resources \n'));
  spinner.color = 'blue';
  return spinner.start();
}

/**
 * 
 * @param {*} args 
 * @returns {import('.').ReactorSettings}
 */
async function setSettings(args) {
  const settings = await checkArgs(args);
  settings.accessToken = await checkAccessToken(settings);
  settings.reactor = await getReactor(settings);
  return settings;
}

async function pull(args) {
  const spinner = await startSpinner();
  const settings = await setSettings(args);

  await ensureDirectory(settings.propertyId);

  await writeResources(resourceTypes, settings);
  spinner.stop();
}

module.exports = pull;
