/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { exec } = require('child_process');
const fs = require('fs');
const path = require('node:path');
const mkdirp = require('mkdirp');
const sanitize = require('sanitize-filename');

const isWindows = require('node:os').platform() === 'win32';

/**
 * 
 * @param {import('fs').PathLike} localPath 
 * @returns {import('fs').PathLike}
 */
async function checkCreateDir(localPath) {
  try {
    await fs.promises.access(localPath);
    // eslint-disable-next-line no-empty
  } catch (e) {
    return mkdirp(localPath);
  }
}

/**
 * @param {import('./writeResources').ReactorDataEntry} data 
 * @param {import('..').ReactorSettingsWithSDK} args 
 * @returns {{ localPath: string, localDirectory: string }}
 */
function getLocalPath(data, args) {
  const propertyPath = `.${path.sep}${args.propertyId}`;
  return {
    'localPath': `${propertyPath}${path.sep}${data.type}${path.sep}${data.id}`,
    'localDirectory': `${propertyPath}${path.sep}${data.type}`
  };
}

/**
 * 
 * @param {string} data 
 * @returns {string}
 */
function sanitizeName(data) {
  // create a name that links to the original file
  if (data.attributes.name) {
    return '_' + sanitize(data.attributes.name, {
      replacement: '_'
    });
  }
}

async function symLinkWindows(localDirectory, sanitizedName, data) {
  return new Promise((res, rej) => {
    // Please see https://github.com/nodejs/node/issues/18518 (this has NOT been solved)
    exec(
      `mklink /J "${localDirectory}${path.sep}${sanitizedName}" "${localDirectory}${path.sep}${data.id}"`,
      { windowsHide: true },
      (err, stdout) => {
        if (err) {
          return rej(err);
        }

        return res(stdout);
      }
    );
  });
}

async function makeSymLink(localDirectory, sanitizedName, data) {
  try {
    await fs.promises.access(`${localDirectory}${path.sep}${sanitizedName}`);
  } catch (e) {
    try {
      if (isWindows) {
        await symLinkWindows(localDirectory, sanitizedName, data);
      } else {
        await mkdirp(`${localDirectory}${path.sep}${sanitizedName}`);
        await fs.promises.symlink(data.id, `${localDirectory}${path.sep}${sanitizedName}`, 'dir');
      }
    } catch (e) {
      if (e.code === 'EEXIST') {
        return;
      } else {
        throw e;
      }
    }
  }
}

/**
 * 
 * @param {string} data 
 * @param {import('fs').PathLike} localDirectory 
 * @returns {Promise<void>}
 */
async function sanitizeLink(data, localDirectory) {
  const sanitizedName = sanitizeName(data);
  if (sanitizeName(data))
    return makeSymLink(localDirectory, sanitizedName, data);
}

/**
 * 
 * @param {import('fs').PathLike} localPath 
 * @param {import('./writeResources').ReactorDataEntry} data 
 */
async function writeDataJson(localPath, data) {
  return fs.promises.writeFile(
    `${localPath}${path.sep}data.json`,
    JSON.stringify(data, null, '  ')
  );
}

/**
 * 
 * @param {import('./writeResources').ReactorDataEntry} data 
 * @param {import('fs').PathLike} localPath 
 * @returns {{ [key: string]: string | boolean | number }}
 */
async function getSettings(data, localPath) {
  const settings = JSON.parse(data.attributes.settings);

  if (settings) {
    await fs.promises.writeFile(
      `${localPath}${path.sep}settings.json`,
      JSON.stringify(settings, null, '  ')
    );
    return settings;
  }
}

/**
 * 
 * @param {import('./writeResources').ReactorDataEntry} data 
 * @param {import('..').ReactorSettingsWithSDK} args 
 */
async function toFiles(data, args) {
  const reactor = args.reactor;
  const { localPath, localDirectory } = getLocalPath(data, args);
  await checkCreateDir(localPath);
  await sanitizeLink(data, localDirectory);
  await writeDataJson(localPath, data);

  // if the data has settings, make changes to it
  if (data.attributes.settings) {
    const settings = await getSettings(data, localPath);

    if (settings) {
      /** @type {import('./writeResources').ReactorTypeElement["transforms"]} */
      let transforms;

      // dataElements
      if (data.type === 'data_elements') {
        if (
          data.relationships.updated_with_extension_package &&
          data.relationships.updated_with_extension_package.data
        ) {
          /** @type {import('./writeResources').ReactorDataEntry} */
          const extensionPackage = (await reactor.getExtensionPackage(
            data.relationships.updated_with_extension_package.data.id
          )).data;

          // data elements
          let items = extensionPackage.attributes.data_elements;

          // find the correct rule_component that goes with this type
          transforms = items.find((item) => (
            item.id === data.attributes.delegate_descriptor_id
          )).transforms;
        }

        // extensions
      } else if (data.type === 'extensions') {
        if (
          data.relationships.extension_package &&
          data.relationships.extension_package.data
        ) {
          /** @type {import('./writeResources').ReactorDataEntry} */
          const extensionPackage = (await reactor.getExtensionPackage(
            data.relationships.extension_package.data.id
          )).data;

          // transforms
          transforms = extensionPackage.attributes.configuration.transforms;
        }

        // rule_components
      } else if (data.type === 'rule_components') {
        if (
          data.relationships.updated_with_extension_package &&
          data.relationships.updated_with_extension_package.data
        ) {
          /** @type {import("./writeResources").ReactorTypeElement | undefined} */
          let items;
          /** @type {import('./writeResources').ReactorDataEntry} */
          const extensionPackage = (await reactor.getExtensionPackage(
            data.relationships.updated_with_extension_package.data.id
          )).data;

          // if actions
          if (
            data.attributes.delegate_descriptor_id.indexOf('::actions::') !== -1 &&
            extensionPackage.attributes.actions
          ) {
            items = extensionPackage.attributes.actions;
            // if events
          } else if (
            data.attributes.delegate_descriptor_id.indexOf('::events::') !== -1 &&
            extensionPackage.attributes.events
          ) {
            items = extensionPackage.attributes.events;
            // if conditions
          } else if (
            data.attributes.delegate_descriptor_id.indexOf('::conditions::') !== -1 &&
            extensionPackage.attributes.conditions
          ) {
            items = extensionPackage.attributes.conditions;
          }
          // find the correct rule_component that goes with this type
          transforms = items.find((item) => (
            item.id === data.attributes.delegate_descriptor_id
          )).transforms;
        }
      }

      if (transforms) {
        const get = function (path, obj) {
          var
            parts,
            part,
            value = '',
            i, il;

          // break into parts
          parts = path.split('.');

          // loop through parts
          for (i = 0, il = parts.length; i < il; i++) {
            part = parts[i];

            // if that path exists
            if (obj[part]) {
              // if it is the last part
              if (i === il - 1) {
                value = obj[part];
                // otherwise drop down
              } else {
                obj = obj[part];
              }
            } else {
              break;
            }
          }

          return value;
        };

        // loop through and make the transform and save
        return Promise.all(transforms.map(async function (transform) {
          var value;

          // get the value
          value = get(transform.propertyPath, settings);

          // if we didn't get anything back
          if (!value) return;

          // function 
          if (transform.type === 'function') {

            value = `//==== START TRANSFORM CODE - DO NOT REMOVE ====
function (${transform.parameters ? transform.parameters.join(', ') : ''}) {
//==== END TRANSFORM CODE ====
${value}
//==== START TRANSFORM CODE - DO NOT REMOVE ====
}
//==== END TRANSFORM CODE ====`;

            // write the settings file.
            return fs.promises.writeFile(
              `${localPath}/settings.${transform.propertyPath}.js`,
              value
            );

            // file or customCode
          } else if (
            transform.type === 'file' ||
            transform.type === 'customCode'
          ) {
            // write the settings file.
            return fs.promises.writeFile(
              `${localPath}${path.sep}settings.${transform.propertyPath}.js`,
              value
            );
          } else if (process.env.LOG_LEVEL === 'ERROR') {
            console.error('unrecognized transform');
            console.log(transform);
          }
        }));
      }
    }
  }
}

module.exports = toFiles;