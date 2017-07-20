## Newline Powertools API

This is a Node.js and Express based API that is used by my [Newline Powertools Chrome extension](https://github.com/dhughes/newline-powertools). This API is designed to be deployed to AWS Lambda and exposed through the API Gateway. 

The API has a single endpoint that is called by the Chrome Extension. It is triggered when students or instructors go to any page on Newline that contains files to download. When this happens details about these files and the project are sent to the API for processing. 

The API follows this basic process:

1. Check to see if a Github repository exists that matches the name of the project. If not, create it.
2. Commit messages on the generated repos are based on the globally unique downloaded filenames. As such, we can check to see if this particular file (or set of files) has already been committed to Github. If so, the API simply returns the URL to the repository and exits. If not, it continues on...
3. The API clones the Github repository into a temporary folder. 
4. It then removes all files from the cloned directory except for the `.git` folder.
5. The download files are downloaded and, if zip files, extracted into the project directory.
6. The final set of files is added, committed, and pushed back to Github and the API ultimately returns the URL to the Github repository.

This process takes into account that changes to the project files may take place. If so, this will simply be recorded as a new commit in the git repo.
