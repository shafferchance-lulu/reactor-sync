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

const checkAccessToken = require('./utils/getAccessToken');
const getReactor = require('./utils/getReactor');
const fromFile = require('./utils/fromFile');
const toFiles = require('./utils/toFiles');
const checkArgs = require('./utils/checkArgs');
const toMethodName = require('./utils/resourceName');
const diff = require('./diff');
const ensureDirectory = require('./utils/ensureDirectory');
const cliProgress = require('cli-progress');
const colors = require('ansi-colors');


async function updateExtension(reactor, local) {
  return (await reactor.updateExtension(
    local.id,
    {
      data: {
        id: local.id,
        type: local.type,
        attributes: local.attributes,
        relationships: local.relationships
      }
    })).data;
}

/**
 * 
 * @param {import("@adobe/reactor-sdk")} reactor 
 * @param {*} local 
 * @returns 
 */
async function updateResource(reactor, local) {
  const resourceName = toMethodName(local.type, true);
  let update;
  try {
    update = (await reactor[`update${resourceName}`]({
      id: local.id,
      type: local.type,
      attributes: local.attributes
    })).data;
    maybeRevise(resourceName, reactor, local);
  } catch (_e) {
    const originalResourceName = toMethodName(local.type, true);
    update = (await reactor[`update${originalResourceName}`]({
      id: local.id,
      type: local.type,
      attributes: local.attributes
    })).data;
    maybeRevise(originalResourceName, reactor, local);
  }

  return update;
}

async function updateExtensionOr(reactor, local) {
  if (local.type === 'extensions') return await updateExtension(reactor, local);
  return await updateResource(reactor, local);
}

async function maybeRevise(resourceName, reactor, local) {
  if (resourceName === ('Extension' || 'DataElement'))
    return await reactor[`revise${resourceName}`](local.id);
}

async function getFetchBehindPromiseJob(comparison, reactor, args, singleBar) {
  const resourceMethodName = toMethodName(comparison.type, true);
  singleBar.update({ filename: `${resourceMethodName}/${comparison.id}` });
  return reactor[`get${resourceMethodName}`](comparison.id)
    .then(({ data: reactorResponse }) => {
      return toFiles(reactorResponse, args);
    });
}

function getFetchBehindPromise(group, reactor, args, singleBar) {
  if (Array.isArray(group)) {
    return Promise.all(
      group.map(
        (groupMember) => getFetchBehindPromiseJob(groupMember, reactor, args, singleBar)));
  } else {
    return getFetchBehindPromiseJob(group, reactor, args, singleBar);
  }
}

/**
 * 
 * @param {import("@adobe/reactor-sdk").default} reactor 
 * @param {import('.').ReactorSettings} args 
 * @param {any} singleBar 
 * @param {any[]} behindArray
 * @param {number} [batch]
 */
function* fetchBehind(reactor, args, singleBar, behindArray, batch = 5) {
  let groupedArray = behindArray;
  if (batch && batch > 1) {
    let groupNumber = 0;
    groupedArray = groupedArray.reduce((groups, now, idx) => {
      if ((idx + 1) % batch === 0) {
        groupNumber++;
      }

      if (groups[groupNumber] === undefined) {
        groups.push([]);
      }

      groups[groupNumber].push(now);
      return groups;
    }, []);
  }
  for (const group of groupedArray) {
    yield getFetchBehindPromise(group, reactor, args, singleBar, batch);
  }
}

module.exports = async (args) => {
  const settings = await checkArgs(args);

  settings.accessToken = await checkAccessToken(settings);
  const reactor = await getReactor(settings);

  await ensureDirectory(settings.propertyId);

  const result = await diff(args);
  // const shouldSyncSome = shouldSync(args);

  // added
  // for (const comparison of result.added) {
  //   // TODO: 
  // }

  // modified
  if (
    !args.behind ||
    args.modified
  ) {
    console.log('🔂 Syncing Modified.');
    const modifiedBar = new cliProgress.SingleBar({
      format: 'Sync Progress | ' + colors.magenta('{bar}') + ' | {percentage}% | {filename} | {value}/{total} Files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    modifiedBar.start(result.modified.length, 0, { filename: '' });
    await Promise.all(result.modified.map(async (comparison) => {
      try {
        const local = await fromFile(comparison.path, args);
        modifiedBar.update(modifiedBar.getProgress(), { filename: local.id });
        // sync it
        const updated = await updateExtensionOr(reactor, local);

        // Persist the updated files back in the form it is supposed to look like:
        await toFiles(updated, args);
      } catch (e) {
        console.error(e);
      } finally {
        modifiedBar.update(modifiedBar.getProgress() + 1, { filename: '' });
      }
    }));
    modifiedBar.stop();
  }

  // behind
  if (
    !args.modified ||
    args.behind
  ) {
    console.log('↩️  Syncing behind.');
    const batchSize = args.b || args['batch-by'];
    const singleBar = new cliProgress.SingleBar({
      format: 'Sync Progress | ' + colors.cyan('{bar}') + ' | {percentage}% | {filename} | {value}/{total} Files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    singleBar.start(result.behind.length, 0, { filename: '' });
    for await (const _ of fetchBehind(reactor, args, singleBar, result.behind, batchSize)) {
      // For now the File count can go over but meh
      singleBar.increment(batchSize || 5);
    }
    singleBar.stop();
  }
  // While this shouldn't be needed something is hanging so meh
  process.exit(0);
};
