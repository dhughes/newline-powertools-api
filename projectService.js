const prettyjson = require('prettyjson');
const Promise = require('bluebird');
const request = Promise.promisify(require('request'));
const download = Promise.promisify(require('download-file'));
const which = Promise.promisify(require('which'));
const fs = require('fs-extra');
const Repository = require('git-cli').Repository;
const uuid = require('uuid/v4');
const merge = require('lodash/merge');
const unzipper = require('unzipper');
const path = require('path');
const tar = require('tar');

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
    const tempGit = '/tmp/git';
    const githubApiToken = process.env.GITHUB_API_TOKEN;
    const apiRoot = 'https://api.github.com';
    const githubRoot = `https://${githubUsername}:${githubApiToken}@github.com/`;
    const token = `access_token=${githubApiToken}`;
    const org = 'tiy-raleigh-java';

    // constants that are dynamic :)
    const slug = project.name.replace(/\W+/g, '-');
    const workingDir = `${tempDir}/${slug}`;
    const expectedMessage = project.files.map(file => file.uniqueName).sort().toString();

    //this.walkPromise('/tmp/git').then(res => console.log(res));

    return (
      Promise.resolve({
        tempDir,
        tempGit,
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
        //
        .then(state => this.ensureGitIsInstalled(state))
        // log our environment
        .then(state => this.log(state, process.env, 'Environment Vars'))
        // make sure our project exists as a github repo
        .then(state => this.ensureGithubRepoExists(state))
        // check if github is up to date. If not, we sync!
        .then(state =>
          this.checkIfGithubIsUpToDate(state).then(state => {
            if (!state.githubUpToDate) return this.performSync(state);
            else return state;
          })
        )
        // log our state
        .then(state => this.log(state, state, 'State'))
        // catch any errors
        .catch(error => this.log(state, error, 'sync/Error!'))
    );
  };

  /**
   * This function ensures that Git is installed
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.ensureGitIsInstalled = state =>
    this.log(state, 'Ensuring Git is Installed')
      // which git
      .then(() => which('git'))
      // if git is found then print its location
      .then(res => this.log(state, res, 'Git is Installed At'))
      // if git is not found then install it
      .catch(() => this.log(state, 'Git is NOT Installed').then(() => this.installGit(state)))
      // return the state
      .then(() => state);

  this.installGit = state =>
    this.log(state, 'Installing Git')
      .then(() => fs.ensureDir(state.tempGit))
      // extract the tar for git
      .then(() =>
        tar
          .extract({
            cwd: state.tempGit,
            file: path.join(__dirname, 'git-2.4.3.tar')
          })
          // add git to the path
          .then(() => this.addGitToPath(state))
          .catch(error => {
            console.log('there was an error extracting git', error);
            return state;
          })
      )
      .catch(error => this.log(state, error, 'installGit/Error!'));

  this.addGitToPath = state =>
    this.log(state, 'Adding Git to Path')
      // add git to the path
      .then(() => {
        const GIT_TEMPLATE_DIR = path.join(state.tempGit, '/usr/share/git-core/templates');
        const GIT_EXEC_PATH = path.join(state.tempGit, '/usr/libexec/git-core');
        const binPath = path.join(state.tempGit, '/usr/bin');

        process.env.PATH = `${process.env.PATH}:${binPath}`;
        process.env.GIT_TEMPLATE_DIR = GIT_TEMPLATE_DIR;
        process.env.GIT_EXEC_PATH = GIT_EXEC_PATH;

        return state;
      })
      // which git
      .then(() => which('git'))
      .then(res => this.log(state, res, 'Git is Installed At'))
      .catch(error => this.log(state, error, 'addGitToPath/Error!'))
      .then(() => state);

  /**
   * This performs all the actions of actively syncing the zip files to github
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.performSync = state =>
    this.log(state, 'Performing Sync To Github...').then(() =>
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
        .then(state => this.pushToGithub(state))
    );

  /**
   * Push master to github
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.pushToGithub = state =>
    this.log(state, 'Pushing to Github')
      .then(() => new Repository(state.workingDir + '/.git').push())
      .catch(error => this.log(state, error, 'pushToGithub/Error!'))
      .then(() => state);

  /**
   * This commits the changes to git using the correct commit message
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.gitCommit = state =>
    this.log(state, 'Committing to Local Repo')
      .then(() => new Repository(state.workingDir + '/.git').commit(state.expectedMessage))
      .catch(error => this.log(state, error, 'gitCommit/Error!'))
      .then(() => state);

  /**
   * This adds any changed files to git
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.gitAdd = state =>
    this.log(state, 'Adding to Local Repo')
      .then(() => new Repository(state.workingDir + '/.git').add())
      .catch(error => this.log(state, error, 'gitAdd/Error!'))
      .then(() => state);

  /**
   * This deletes the zip files
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.cleanupZips = state =>
    this.log(state, 'Clean up Zip Files').then(() =>
      Promise.map(state.project.files, file => fs.remove(file.tempFile))
        .then(() => fs.remove(`${state.workingDir}/__MACOSX`))
        .catch(error => this.log(state, error, 'cleanupZips/Error!'))
        .then(() => state)
    );

  /**
   * This extracts a zip file
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.extractZips = state =>
    this.log(state, 'Extract Zip Files').then(() =>
      Promise.map(state.project.files, file =>
        fs.createReadStream(file.tempFile).pipe(unzipper.Extract({ path: state.workingDir })).promise()
      )
        .catch(error => this.log(state, error, 'extractZips/Error!'))
        .then(() => state)
    );

  /**
   * This downloads the zips for the project into a temporary directory
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.downloadZips = state =>
    this.log(state, 'Download Zip Files').then(() =>
      Promise.map(state.project.files, file =>
        download(file.url, { directory: state.workingDir, filename: file.uniqueName }).then(tempFile =>
          merge({}, file, { tempFile })
        )
      )
        .catch(error => this.log(state, error, 'downloadZips/Error!'))
        .then(files => merge({}, state, { project: { files } }))
    );

  /**
   * This checks to see if github is up to date with the latest zip files
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.checkIfGithubIsUpToDate = state =>
    this.log(state, 'Checking if Github is Up To Date').then(() =>
      get(`${state.apiRoot}/repos/${state.org}/${state.slug}/commits?${state.token}`)
        .then(response => {
          if (response.statusCode === 200) {
            // we are expecting that the files have been changed. if not then we throw a message
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
        })
        .catch(error => this.log(state, error, 'checkIfGithubIsUpToDate/Error!'))
    );

  /**
   * Deletes everything from the project directory except for the .git folder.
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.emptyProjectDirectory = state =>
    this.log(state, 'Emptying Project Directory').then(() => {
      const tempGitFolderName = uuid();

      return (
        fs
          //temporarily move the .git folder
          .move(`${state.workingDir}/.git`, `${state.workingDir}/../${tempGitFolderName}`)
          // remove all the files from the working directory
          .then(() => fs.emptyDir(state.workingDir))
          // move the .git directory back into place
          .then(() => fs.move(`${state.workingDir}/../${tempGitFolderName}`, `${state.workingDir}/.git`))
          .catch(error => this.log(state, error, 'emptyProjectDirectory/Error!'))
          .then(() => state)
      );
    });

  /**
   * This clones a github repository to the a working directory
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  this.cloneGithubRepo = state =>
    this.log(state, 'Cloning Github Repo')
      .then(() => Repository.clone(`${state.githubRoot}${state.org}/${state.slug}`, state.workingDir))
      .catch(error => this.log(state, error, 'cloneGithubRepo/Error!'))
      .then(() => state);

  /**
   * Remove the project's working directory if it exists
   * @param  {} state   the current state object
   * @return {}         the current state object
   */
  this.removeProjectDirectory = state =>
    this.log(state, 'Remove Project Working Directory')
      .then(() => fs.remove(state.workingDir))
      .catch(error => this.log(state, error, 'removeProjectDirectory/Error!'))
      .then(() => state);

  /**
   * makes sure a github repository exists for this project
   * @param  {} state   the current state object
   * @return {}         the current state object
   */
  this.ensureGithubRepoExists = state =>
    this.log(state, 'Ensuring Github Repo Exists')
      .then(() =>
        get(`${state.apiRoot}/repos/${state.org}/${state.slug}?${state.token}`).then(response => {
          if (response.statusCode === 200) {
            return this.log(state, 'Github Repo Happily Exists');
          } else if (response.statusCode === 404) {
            return this.createRepository(state);
          } else {
            throw new Error(`Unable to confirm ${state.slug} exists on Github. HTTP status: ${response.statusCode}`);
          }
        })
      )
      .catch(error => this.log(state, error, 'ensureGithubRepoExists/Error!'));

  /**
   * Creates a repository on Github
   * @param  {} state   the current state object
   * @return {}         the current state object
   */
  this.createRepository = state =>
    this.log(state, 'Creating Github Repo')
      .then(() => {
        const repository = {
          name: state.slug
        };

        return post(`${state.apiRoot}/orgs/${state.org}/repos?${state.token}`, repository).then(response => {
          if (response.statusCode === 201) {
            return state;
          } else {
            throw new Error(
              `Unable to create new github repository '${state.slug}'. HTTP status: ${response.statusCode}`
            );
          }
        });
      })
      .catch(error => this.log(state, error, 'createRepository/Error!'));

  /**
   * Logs the state to the console
   * @param  {} state   the current state object
   * @return {}         the current state object
   */
  this.log = (state, thing = state, label = '') => {
    console.log(`-----${label}-----`);
    console.log(prettyjson.render(thing));
    console.log(`-----${label.replace(/./g, '-')}-----`);
    return Promise.resolve(state);
  };

  /**
   * Helper function for get requests
   * @param  {[type]} url [description]
   * @return {[type]}     [description]
   */
  function get(url) {
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
    return request({
      url: url,
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'User-Agent': 'newline-powertools-api'
      }
    });
  }

  this.walkPromise = Promise.promisify(walk);

  function walk(dir, done) {
    var results = [];
    fs.readdir(dir, function(err, list) {
      if (err) return done(err);
      var pending = list.length;
      if (!pending) return done(null, results);
      list.forEach(function(file) {
        file = path.resolve(dir, file);
        fs.stat(file, function(err, stat) {
          if (stat && stat.isDirectory()) {
            walk(file, function(err, res) {
              results = results.concat(res);
              if (!--pending) done(null, results);
            });
          } else {
            results.push(file);
            if (!--pending) done(null, results);
          }
        });
      });
    });
  }
}

module.exports = ProjectService;
