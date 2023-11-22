const fs = require('fs').promises;
const path = require('path');


module.exports = async (id) => {
  const dirPath = path.resolve(process.cwd(), id);

  try {
    await fs.access(dirPath);
  } catch (e) {
    await fs.mkdir(dirPath);
    const splitPath = dirPath.split(path.sep);
    const propertyId = splitPath[splitPath.length -1];
    if (!propertyId.startsWith('PR')) {
      throw new TypeError('Passed path is missing property id');
    }

    await fs.writeFile(path.resolve(dirPath, 'data.json'), JSON.stringify({ type: 'Property', id: propertyId  }));
  
    const directories = ['data_elements','environments','extensions','rule_components','rules'];
    await Promise.all(directories.map((dir) => {
      return fs.mkdir(path.resolve(dirPath, dir)).catch((e) => {
        if (e.code === 'EEXIST') {
          return true;
        }

        throw e;
      });
    }));
  }
};