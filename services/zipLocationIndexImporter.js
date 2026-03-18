const path = require('path');

const { importZipLocationIndexFromFile } = require('./zipLocationIndex');

const DEFAULT_ZIP_INDEX_FILE = process.env.ZIP_LOCATION_INDEX_FILE
  || path.join(__dirname, '..', 'data', 'zipLocationIndex.json');

const importZipLocationIndex = async (filePath = DEFAULT_ZIP_INDEX_FILE) => {
  return importZipLocationIndexFromFile(filePath);
};

if (require.main === module) {
  importZipLocationIndex()
    .then((result) => {
      console.log('Zip location index import complete:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Zip location index import failed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  importZipLocationIndex
};
