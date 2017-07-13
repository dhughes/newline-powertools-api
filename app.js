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
    .then(result => res.json(result))
    // if there are any errors, be sure to catch them
    .catch(e => {
      res.status(500).json(e);
    });
});

// The aws-serverless-express library creates a server and listens on a Unix
// Domain Socket for you, so you can remove the usual call to app.listen.
// app.listen(3000)

// Export your express server so you can import it in the lambda function.
module.exports = app;
