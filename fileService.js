const Promise = require('bluebird');
const download = Promise.promisify(require('download-file'));
const unzipper = require('unzipper');
const fs = require('fs-extra');

module.exports = function FileService(downloadDirectory) {
  // this downloads a file from newline and saves it into the temp directory
  this.downloadFile = file => {
    return download(file.url, { directory: downloadDirectory, filename: file.uniqueName }).then(tempFile =>
      Object.assign({}, file, { tempFile })
    );
  };

  // this unzips a files into its temp directory
  this.unzip = files =>
    Promise.map(files, file =>
      fs.createReadStream(file.tempFile).pipe(unzipper.Extract({ path: downloadDirectory })).promise()
    )
      .then(() =>
        Promise.map(files, file => {
          fs.remove(file.tempFile);
        })
      )
      .then(() => fs.remove(downloadDirectory + '/__MACOSX'))
      .then(() => files);
  // // cleaup the zips
  // .map(file => fs.remove(file.tempFile))
  // // cleanup the __MACOSX directory
  // .then(() => fs.remove(downloadDirectory + '/__MACOSX'));

  // // and remove the zip files
  // .then(() => fs.remove(file.tempFile))
  // // return the set of files we started with
  // .then(() => file);

  // // remove the __MACOSX directory
  // this.cleanup = files => {
  //   fs.remove(downloadDirectory + '/__MACOSX');
  //   return files;
  // };
};
