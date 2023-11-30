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

const fs = require('fs');

const deleteDirectory = async function (path) {
  await fs.promises.access(path);

  await Promise.all(await fs.readdir(path).map(async function (file) {

    const curPath = `${path}/${file}`;

    // recurse
    if (fs.promises.lstat(curPath).isDirectory()) {
      return deleteDirectory(curPath);

      // delete file
    } else {
      return fs.promises.unlink(curPath);
    }
  }));

  return fs.promises.rmdir(path);
};

module.exports = deleteDirectory;