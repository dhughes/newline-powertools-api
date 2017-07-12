const prettyjson = require('prettyjson');
const Promise = require('bluebird');
const request = Promise.promisify(require('request'));
const download = Promise.promisify(require('download-file'));
const fs = require('fs-extra');
const Repository = require('git-cli').Repository;
const uuid = require('uuid/v4');
const merge = require('lodash/merge');
const unzipper = require('unzipper');

function ProjectService() {
  /**
   * Sync the given project files to github (as needed)
   * @param  {} project an object containing an array of file names and details
   * @return {}         the current state object
   */
  this.sync = project => {
    // constants
    const githubUsername = 'dhughes';
    const tempDir = '/tmp/projects';
    const githubApiToken = process.env.GITHUB_API_TOKEN;
    const apiRoot = 'https://api.github.com';
    const githubRoot = `https://${githubUsername}:${githubApiToken}@github.com/`;
    const token = `access_token=${githubApiToken}`;
    const org = 'tiy-raleigh-java';

    // constants that are dynamic :)
    const slug = project.name.replace(/\W+/g, '-');
    const workingDir = `${tempDir}/${slug}`;
    const expectedMessage = project.files.map(file => file.uniqueName).sort().toString();

    return (
      Promise.resolve({
        tempDir,
        githubApiToken,
        apiRoot,
        token,
        org,
        project,
        slug,
        workingDir,
        expectedMessage,
        githubRoot
      })
        // make sure our project exists as a github repo
        .then(state => this.insureGithubRepoExists(state))
        // check if github is up to date. If not, we sync!
        .then(state =>
          this.checkIfGithubIsUpToDate(state).then(state => {
            if (!state.githubUpToDate) return this.performSync(state);
            else return state;
          })
        )
        // log our state
        .then(state => this.log(state))
    );
  };

  /**
   * This performs all the actions of actively syncing the zip files to github
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.performSync = state =>
    this.removeProjectDirectory(state)
      // clone the github repo
      .then(state => this.cloneGithubRepo(state))
      // empty the project directory (except for .git)
      .then(state => this.emptyProjectDirectory(state))
      // download the zip files
      .then(state => this.downloadZips(state))
      // extract the zip files
      .then(state => this.extractZips(state))
      // remove the zip files and the __MACOSX folder
      .then(state => this.cleanupZips(state))
      // add the changed files
      .then(state => this.gitAdd(state))
      // commit the changes
      .then(state => this.gitCommit(state))
      // push the changes to github
      .then(state => this.pushToGithub(state));

  /**
   * Push master to github
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.pushToGithub = state => new Repository(state.workingDir + '/.git').push().then(() => state);

  /**
   * This commits the changes to git using the correct commit message
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.gitCommit = state => new Repository(state.workingDir + '/.git').commit(state.expectedMessage).then(() => state);

  /**
   * This adds any changed files to git
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.gitAdd = state => new Repository(state.workingDir + '/.git').add().then(() => state);

  /**
   * This deletes the zip files
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.cleanupZips = state =>
    Promise.map(state.project.files, file => fs.remove(file.tempFile))
      .then(() => fs.remove(`${state.workingDir}/__MACOSX`))
      .then(() => state);

  /**
   * This extracts a zip file
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.extractZips = state =>
    Promise.map(state.project.files, file =>
      fs.createReadStream(file.tempFile).pipe(unzipper.Extract({ path: state.workingDir })).promise()
    ).then(() => state);

  /**
   * This downloads the zips for the project into a temporary directory
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.downloadZips = state =>
    Promise.map(state.project.files, file =>
      download(file.url, { directory: state.workingDir, filename: file.uniqueName }).then(tempFile =>
        merge({}, file, { tempFile })
      )
    ).then(files => merge({}, state, { project: { files } }));

  /**
   * This checks to see if github is up to date with the latest zip files
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.checkIfGithubIsUpToDate = state =>
    get(`${state.apiRoot}/repos/${state.org}/${state.slug}/commits?${state.token}`).then(response => {
      if (response.statusCode === 200) {
        // we are expecting that the files have been changed. not not then we throw a message
        if (JSON.parse(response.body).map(commit => commit.commit.message).pop() === state.expectedMessage) {
          return merge({}, state, { githubUpToDate: true });
        }

        // 409 means there have been no commits yet, thus there are changes. Anything else is an error.
      } else if (response.statusCode !== 409) {
        throw new Error(
          `Unable to confirm whether or not ${state.slug} contains the current file information. IE: I couldn't check the logs. HTTP status: ${response.statusCode}`
        );
      }

      return merge({}, state, { githubUpToDate: false });
    });

  /**
   * Deletes everything from the project directory except for the .git folder.
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.emptyProjectDirectory = state => {
    const tempGitFolderName = uuid();

    return (
      fs
        //temporarily move the .git folder
        .move(`${state.workingDir}/.git`, `${state.workingDir}/../${tempGitFolderName}`)
        // remove all the files from the working directory
        .then(() => fs.emptyDir(state.workingDir))
        // move the .git directory back into place
        .then(() => fs.move(`${state.workingDir}/../${tempGitFolderName}`, `${state.workingDir}/.git`))
        .then(() => state)
    );
  };

  /**
   * This clones a github repository to the a working directory
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.cloneGithubRepo = state =>
    Repository.clone(`${state.githubRoot}${state.org}/${state.slug}`, state.workingDir).then(() => state);

  /**
   * Remove the project's working directory if it exists
   * @param  {} state   the current state object
   * @return {}         the current state object
   */
  this.removeProjectDirectory = state => fs.remove(state.workingDir).then(() => state);

  /**
   * makes sure a github repository exists for this project
   * @param  {} state   the current state object
   * @return {}         the current state object
   */
  this.insureGithubRepoExists = state =>
    get(`${state.apiRoot}/repos/${state.org}/${state.slug}?${state.token}`).then(response => {
      if (response.statusCode === 200) {
        return state;
      } else if (response.statusCode === 404) {
        return this.createRepository(state);
      } else {
        throw new Error(`Unable to confirm ${state.slug} exists on Github. HTTP status: ${response.statusCode}`);
      }
    });

  /**
   * Creates a repository on Github
   * @param  {} state   the current state object
   * @return {}         the current state object
   */
  this.createRepository = state => {
    const repository = {
      name: state.slug
    };

    return post(`${state.apiRoot}/orgs/${state.org}/repos?${state.token}`, repository).then(response => {
      if (response.statusCode === 201) {
        return state;
      } else {
        throw new Error(`Unable to create new github repository '${state.slug}'. HTTP status: ${response.statusCode}`);
      }
    });
  };

  /**
   * Logs the state to the console
   * @param  {} state   the current state object
   * @return {}         the current state object
   */
  this.log = state => {
    console.log(prettyjson.render(state));
    return state;
  };

  /**
   * Helper function for get requests
   * @param  {[type]} url [description]
   * @return {[type]}     [description]
   */
  function get(url) {
    console.log('GET: ' + url);
    return request({
      url: url,
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
      url: url,
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'User-Agent': 'newline-powertools-api'
      }
    });
  }
}

module.exports = ProjectService;
