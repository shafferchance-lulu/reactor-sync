const checkArgs = require('./utils/checkArgs');
const { access, readFile, writeFile, mkdir } = require('fs/promises');
const { resolve } = require('path');
const readline = require('node:readline');

async function writeToFile(path, outputData) {
  return readFile(path).then((data) => outputData(data)).then((output) => writeFile(path, output));
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));
const REACTOR_API_URL = 'https://reactor.adobe.io/';
async function tryToValidateSettings(args, path) {
  try {
    checkArgs(args);
  } catch (e) {
    if (e.message.includes('Launch Sync settings')) {
      // Don't want to worry about the promise boundary here so explicitly keep it sync
      await writeFile(path, '{}');
    } else if (e.message.includes('"environment"')) {
      await writeToFile(path, async (input) => {
        const current = JSON.parse(input);
        const reactorUrl = await prompt(`Reactor API Url (Default: ${REACTOR_API_URL}`);
        current['environment'] = {
          reactorUrl: reactorUrl === '' ? REACTOR_API_URL : reactorUrl,
        };
        return JSON.stringify(current);
      });
    } else if (e.message.includes('"environment.reactorUrl')) {
      await writeFile(path, async (input) => {
        const current = JSON.parse(input);
        const reactorUrl = await prompt(`Reactor API Url (Default: ${REACTOR_API_URL}`);
        current['environment']['reactorUrl'] = reactorUrl === '' ? REACTOR_API_URL : reactorUrl;
        return JSON.stringify(current);
      });
    }
    return tryToValidateSettings(args, path);
  }
}

async function initializeProperty(path) {
  const propertyId = await prompt('What is the id of the property you wish to sync?');
  if (propertyId === '') {
    throw new Error('Property ID is required to know which launch to sync');
  }

  const propertyPath = resolve(process.cwd(), propertyId);
  try {
    await access(propertyPath);
  } catch (e) {
    await mkdir(propertyPath);
  }

  await writeFile(resolve(propertyPath, 'data.json'), JSON.stringify({ id: propertyId, type: 'Property' }));
  
  const directories = ['data_elements','environments','extensions','rule_components','rules'];
  await Promise.all(directories.map((dir) => {
    return mkdir(resolve(propertyPath, dir)).catch((e) => {
      if (e.code === 'EEXIST') {
        return true;
      }

      throw e;
    });
  }));
  console.log('Made');

  return writeToFile(path, (input) => {
    const current = JSON.parse(input);
    current['propertyId'] = propertyId;
    return JSON.stringify(current);
  });
}

module.exports = async (args) => {
  const oldConsoleError = console.error;
  // temporary overwrite
  console.error = (e) => {
    throw new Error(e);
  };
  const path = args.settings === undefined ? resolve(process.cwd(), '.reactor-settings.json') : args.settings;
  return tryToValidateSettings(args, path)
  .then(() => initializeProperty(path))
  .finally(() => {
    console.error = oldConsoleError;
    rl.close();
  });
};
