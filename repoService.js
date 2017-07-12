const Promise = require('bluebird');
const request = Promise.promisify(require('request'));
require('lambda-git')();
const Repository = require('git-cli').Repository;

module.exports = function RepoService(org, apiToken) {
  const apiRoot = 'https://api.github.com';
  const token = `?access_token=${apiToken}`;

  // checks if a repository exists
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

  // creates a repository
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

  // this checks to see if we've ever logged any of the specified file names
  this.assertModified = (slug, files) => {
    const expectedMessage = files.sort().toString();

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

  this.clone = (slug, workingDir) => Repository.clone(`https://github.com/${org}/${slug}`, workingDir);

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
