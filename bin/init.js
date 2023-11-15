const checkArgs = require('./utils/checkArgs');
const {access, readFile, writeFile, mkdir} = require('fs/promises');
const {resolve} = require('path');
const readline = require('node:readline');

async function writeToFile(path, outputData) {
    return readFile(path).then((data) => outputData(data)).then((output) => writeFile(path, output));
}

const rl = readline.createInterface({input: process.stdin, output: process.stdout});
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
                const reactorUrl = await prompt(`Reactor API Url (Default: ${REACTOR_API_URL}): `);
                current['environment'] = {
                    reactorUrl: reactorUrl === '' ? REACTOR_API_URL : reactorUrl,
                };
                return JSON.stringify(current);
            });
        } else if (e.message.include('"environment.reactorUrl')) {
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
    // Function to prompt and validate required settings
    const promptForRequiredSetting = async (settingName) => {
        const value = await prompt(`${settingName}: `);
        if (!value) {
            throw new Error(`${settingName} is required`);
        }
        return value;
    };

    // Prompting for required settings
    const accessToken = await promptForRequiredSetting('Access Token');
    const clientId = await promptForRequiredSetting('Client ID');
    const clientSecret = await promptForRequiredSetting('Client Secret');
    const propertyId = await promptForRequiredSetting('Launch Property ID');

    // Create property directory and subdirectories
    const propertyPath = resolve(process.cwd(), propertyId);
    const directories = ['data_elements', 'environments', 'extensions', 'rule_components', 'rules'];

    // Ensure all directories exist, including the property directory
    await mkdir(propertyPath, {recursive: true});
    await Promise.all(directories.map(dir => mkdir(resolve(propertyPath, dir), {recursive: true})));

    console.log('Directories created & .reactor-settings.json created. Ready to sync.');

    // Update and write settings to the file
    return writeToFile(path, (input) => {
        const current = JSON.parse(input) || {};
        Object.assign(current, {
            propertyId: propertyId, accessToken: accessToken, integration: {clientId, clientSecret}
        });
        return JSON.stringify(current, null, 2); // formatted JSON for readability
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
