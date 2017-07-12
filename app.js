'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
//const compression = require('compression');
const mustacheExpress = require('mustache-express');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');
const ProjectService = require('./projectService');

const app = express();

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
  new ProjectService()
    // sync to a github repo
    .sync(req.body)
    // return the result
    .then(result => res.json(result));

  // // parse the project json

  // Promise
  //   // the specified object will hold the state of our promise chain as we move through it.
  //   .resolve({ project, slug, workingDir, expectedMessage })
  //   .then(state => console.log(state))
  //   .then(state => res.json(state));

  // note: this started out feeling ok, but now it feels rather unclean. Consider refactoring.
  // repo
  //   .assertExists(slug)
  //   // this catches a situation where the repository does not exist.
  //   .catch({ message: 'REPO_DOES_NOT_EXIST' }, e => repo.create(slug))
  //   // if there was an error creating the repo
  //   .catch({ message: 'ERROR_CREATING_REPO' }, e => console.log('There was an error creating the github repository.'))
  //   /*
  //     The repo exists by this point. Now we need to start iterating through the
  //     files to see if any have not been committed to GH
  //   */
  //
  //   // have any of our files been changed since the last commit, if any?
  //   .then(() => repo.assertModified(slug, expectedMessage))
  //   // if we have changes then we need to clone the remote repo
  //   .then(() => repo.clone(slug, workingDir))
  //   // next, we'll download the files from newline into our project/repo
  //   // let's get these file into the scope of this promise chain
  //   .then(() => project.files)
  //   // download all files
  //   .map(file => fileService.downloadFile(file))
  //   // unzip the files (note: I don't like how I'm passing the files array through this chain. it feels weird.)
  //   .then(files => fileService.unzip(files))
  //   // add and commit changed files to git
  //   .then(files => repo.add(workingDir).then(() => files))
  //   // commit any changes
  //   .then(files => repo.commit(workingDir, expectedMessage).then(() => files))
  //   // send a response to the client
  //   .then(files => {
  //     res.json(files);
  //     return files;
  //   })
  //   // log
  //   .then(files => console.log(files));
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
