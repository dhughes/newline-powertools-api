const Promise = require('bluebird');
const request = Promise.promisify(require('request'));
require('lambda-git')({
  updateEnv: process.platform !== 'darwin'
});
const Repository = require('git-cli').Repository;
const fs = require('fs-extra');

module.exports = function RepoService(org, apiToken) {
  const apiRoot = 'https://api.github.com';
  const token = `?access_token=${apiToken}`;

  /**
   * checks if a repository exists
   * @param  {[type]} slug [description]
   * @return {[type]}      [description]
   */
  this.assertExists = slug => {
    return get(`${apiRoot}/repos/${org}/${slug}`).then(response => {
      if (response.statusCode === 200) {
        return true;
      } else if (response.statusCode === 404) {
        throw { message: 'REPO_DOES_NOT_EXIST' };
      } else {
        throw { status: response.statusCode, from: 'assertExists' };
      }
    });
  };

  /**
   * creates a repository
   * @param  {[type]} slug [description]
   * @return {[type]}      [description]
   */
  this.create = slug => {
    const repository = {
      name: slug
    };

    return post(`${apiRoot}/orgs/${org}/repos`, repository).then(response => {
      if (response.statusCode === 201) {
        return true;
      } else {
        throw { message: 'ERROR_CREATING_REPO' };
      }
    });
  };

  /**
   * this checks to see if we've ever logged any of the specified file names
   * @param  {[type]} slug  [description]
   * @param  {[type]} expectedMessage [description]
   * @return {[type]}       [description]
   */
  this.assertModified = (slug, expectedMessage) => {
    return get(`${apiRoot}/repos/${org}/${slug}/commits`).then(response => {
      if (response.statusCode === 200) {
        // we are expecting that the files have been changed. not not then we throw a message
        if (JSON.parse(response.body).map(commit => commit.commit.message).pop() === expectedMessage) {
          throw { message: 'REPO_NOT_CHANGED' };
        }

        // 409 means there have been no commits yet, thus there are changes
      } else if (!response.statusCode === 409) {
        // anything other than 200 or 409 throws a non-message error
        throw { status: response.statusCode, from: 'assertModified' };
      }

      return true;
    });
  };

  /**
   * Clones a repo from github
   * @param  {[type]} slug       [description]
   * @param  {[type]} workingDir [description]
   * @return {[type]}            [description]
   */
  this.clone = (slug, workingDir) => {
    if (!fs.pathExistsSync(workingDir)) {
      return Repository.clone(`https://github.com/${org}/${slug}`, workingDir);
    }
  };

  /**
   * Adds all changes in a directory to git
   * @type {String}
   * @return {[type]}
   */
  this.add = workingDir => new Repository(workingDir + '/.git').add();

  /**
   * commits changes in the specified working directory
   * @param  {[type]} workingDir [description]
   * @param  {[type]} message    [description]
   * @return {[type]}            [description]
   */
  this.commit = (workingDir, message) => new Repository(workingDir + '/.git').commit(message);

  /**
   * Helper function for get requests
   * @param  {[type]} url [description]
   * @return {[type]}     [description]
   */
  function get(url) {
    console.log('GET: ' + url);
    return request({
      url: url + token,
      method: 'GET',
      headers: {
        'User-Agent': 'newline-powertools-api'
      }
    });
  }

  /**
   * helper function for post requests
   * @param  {[type]} url  [description]
   * @param  {[type]} body [description]
   * @return {[type]}      [description]
   */
  function post(url, body) {
    console.log('POST: ' + url);
    return request({
      url: url + token,
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'User-Agent': 'newline-powertools-api'
      }
    });
  }
};
