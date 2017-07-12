'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
//const compression = require('compression');
const mustacheExpress = require('mustache-express');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');
const AWS = require('aws-sdk');
const RepoService = require('./repoService');
const FileService = require('./fileService');

const fs = require('fs-extra');
const fstream = require('fstream');
const path = require('path');

const app = express();

const githubApiToken = process.env.GITHUB_API_TOKEN;
const repo = new RepoService('tiy-raleigh-java', githubApiToken);

app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
//app.use(compression());
app.use(
  cors({
    origin: '*'
  })
);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(awsServerlessExpressMiddleware.eventContext());

app.get('/', (req, res) => {
  console.log('This is the index page. I am logging stuff. Woot.');
  res.render('index', {
    name: 'Lexi'
  });
});

app.post('/project', (req, res) => {
  // parse the project json
  const project = req.body;
  const slug = project.name.replace(/\W+/g, '-');

  const workingDir = '/tmp/projects/' + slug;
  const fileService = new FileService(workingDir);

  repo
    .assertExists(slug)
    // this catches a situation where the repository does not exist.
    .catch({ message: 'REPO_DOES_NOT_EXIST' }, e => repo.create(slug))
    // if there was an error creating the repo
    .catch({ message: 'ERROR_CREATING_REPO' }, e => console.log('There was an error creating the github repository.'))
    /*
      The repo exists by this point. Now we need to start iterating through the
      files to see if any have not been committed to GH
    */

    // have any of our files been changed since the last commit, if any?
    .then(() => repo.assertModified(slug, project.files.map(file => file.uniqueName)))
    // if the repo is unchanged then do nothing
    .catch({ message: 'REPO_NOT_CHANGED' }, e => {})
    // if we have changes then we need to clone the remote repo
    .then(() => repo.clone(slug, workingDir))
    // next, we'll download the files from newline into our project/repo
    // let's get these file into the scope of this promise chain
    .then(() => project.files)
    // download each file
    .map(file => fileService.downloadFile(file))
    // unzip the files (note: I don't like how I'm passing the files array through this chain. it feels weird.)
    .then(files => fileService.unzip(files))
    // send a response to the client
    .then(files => {
      res.json(files);
      return files;
    })
    // log
    .then(files => console.log(files));

  // Promise
  //   // download the files
  //   .map(project.files, file => {
  //     return download(file.url, { directory: workingDir, filename: file.uniqueName }).then(tempFile =>
  //       Object.assign({}, file, { tempFile })
  //     );
  //   })
  //   // unzip the files
  //   .map(file => {
  //     fs.createReadStream(file.tempFile).pipe(unzipper.Extract({ path: workingDir }));
  //     return file;
  //   })
  //   // cleanup the downloaded zips
  //   .map(file => fs.unlink(file.tempFile).then(() => file))
  //   // Note: I tried to cleanup the '__MACOSX' folder but had zero luck.
  //   // whatever
  //   .then(files => walk('/tmp/projects/'))
  //   .then(tempFiles => {
  //     res.json(tempFiles);
  //   })
  //   .catch(err => console.log(err));
});

// The aws-serverless-express library creates a server and listens on a Unix
// Domain Socket for you, so you can remove the usual call to app.listen.
// app.listen(3000)

// Export your express server so you can import it in the lambda function.
module.exports = app;

// var walk = Promise.promisify(function(dir, done) {
//   var results = [];
//   fs.readdir(dir, function(err, list) {
//     if (err) return done(err);
//     var pending = list.length;
//     if (!pending) return done(null, results);
//     list.forEach(function(file) {
//       file = path.resolve(dir, file);
//       fs.stat(file, function(err, stat) {
//         if (stat && stat.isDirectory()) {
//           walk(file, function(err, res) {
//             results = results.concat(res);
//             if (!--pending) done(null, results);
//           });
//         } else {
//           results.push(file);
//           if (!--pending) done(null, results);
//         }
//       });
//     });
//   });
// });
// end temp

/*
app.get('/users/:userId', (req, res) => {
  const user = getUser(req.params.userId);

  if (!user) return res.status(404).json({});

  return res.json(user);
});

app.post('/users', (req, res) => {
  const user = {
    id: ++userIdCounter,
    name: req.body.name
  };
  users.push(user);
  res.status(201).json(user);
});

app.put('/users/:userId', (req, res) => {
  const user = getUser(req.params.userId);

  if (!user) return res.status(404).json({});

  user.name = req.body.name;
  res.json(user);
});

app.delete('/users/:userId', (req, res) => {
  const userIndex = getUserIndex(req.params.userId);

  if (userIndex === -1) return res.status(404).json({});

  users.splice(userIndex, 1);
  res.json(users);
});

const getUser = userId => users.find(u => u.id === parseInt(userId));
const getUserIndex = userId => users.findIndex(u => u.id === parseInt(userId));

// Ephemeral in-memory data store
const users = [
  {
    id: 1,
    name: 'Joe'
  },
  {
    id: 2,
    name: 'Jane'
  }
];
let userIdCounter = users.length;
*/
