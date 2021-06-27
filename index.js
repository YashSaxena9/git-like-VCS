#! /usr/bin/env node

/* util imports */
const fs = require('fs');
const { execSync } = require('child_process');
const { createHash } = require('crypto');
const readline = require('readline');
const { join: pathJoin, resolve: pathRes } = require('path');
const { EOF } = require('os');

/* important variables */
const cwd = process.cwd();
const args = process.argv.slice(2);
const DOT_MYGIT = '.mygit';
const DOT_IGNORE = '.mygitignore';
const BRANCHES_DIR = '.mygit/branches';
const OBJECTS_DIR = '.mygit/objects';
const COMMITS_DIR = '.mygit/objects/commits'; // contains json files
const FILES_DIR = '.mygit/objects/files';
const TREES_DIR = '.mygit/objects/trees'; // contains json files
const CONFIG_FILE = '.mygit/config';
const TREE_STRUCT = '.mygit/root.json'; // json file to show tree

/**
 * throw error and exit program
 */
const throwError = (message) => {
  console.log(message);
  process.exit(0);
};

/**
 * resolve path(one args only)
 * or join path(more than 1 args)
 * depends on no. of arguments
 */
const path = (...arg) => {
  return arg.length === 1 ? pathRes(arg[0]) : pathJoin(...arg);
};

/**
 * hash the data provided in sha256 hash
 */
const hashInSHA = (data) => {
  const hashMethod = createHash('sha256');
  const dataHash = hashMethod.update(data);
  return dataHash.digest('hex'); // data hashed will be in hexadecimal form
};

/**
 * make file
 */
const makeFile = ({ fileName, content = '' }) => {
  if (!fs.existsSync(fileName)) {
    fs.writeFileSync(fileName, content);
  }
  return fileName;
};

/**
 * read file data
 */
const readFile = (file) => {
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
    return '';
  }
  return fs.readFileSync(file, 'utf-8');
};

/**
 * make folder
 */
const makeDir = (folderName) => {
  if (!fs.existsSync(folderName)) {
    fs.mkdirSync(folderName);
  }
  return folderName;
};

/**
 * list all files recursively in folder
 */
const listFiles = ({ dir, root }) => {
  const files = [];
  fs.readdirSync(dir).forEach((content) => {
    if (content === DOT_MYGIT && dir === root) {
      // this is a repository folder inside my root repository
      return;
    }
    const contentPath = path(dir, content);
    if (fs.lstatSync(contentPath).isDirectory()) {
      // nested directory/folder
      const nestedFiles = listFiles({ dir: contentPath, root });
      nestedFiles.forEach((file) => {
        files.push(path(content, file));
      });
    } else {
      // file inside dir
      files.push(content);
    }
  });
  return files;
};

/**
 * compare existing files with the previous version's info
 */
const compareFiles = ({ prev, curr }) => {
  const changedOrAdded = [];
  curr.forEach((file) => {
    if (prev.has(file)) {
      const fileData = readFile(file);
      const fileHash = hashInSHA(fileData);
      if (fileHash !== prev.get(file)) {
        changedOrAdded.push(file);
      }
    } else {
      changedOrAdded.push(file);
    }
  });
  return changedOrAdded;
};

/**
 * list items to ignore(like git ignore file)
 */
const listItemsToIgnore = () => {
  const data = readFile(DOT_IGNORE);
  const items = data.split(EOF);
  const filtered = items.filter((ele) => {
    return ele.trim() !== '';
  });
  return new Set(filtered);
};

/**
 * parse tree.json file to file->hash map
 * used to check hash of a file at a path
 */
const parseTreeJson = (tree) => {
  const treeObj = JSON.parse(readFile(tree));
  const resMap = new Map();
  treeObj.forEach(({ file, hash }) => {
    resMap.set(file, hash);
  });
  return resMap;
};

/**
 * get files which needs to be commited
 * ignore files which are present in previous commit
 * and are unchanged in terms of content too
 */
const getFilesListToCommit = ({ dir, root, parentCommit, toIgnore }) => {
  const files = listFiles({ dir, root }); // set of files
  const filteredIgnoreFiles = files.filter((file) => {
    return !toIgnore.has(file);
  });
  if (parentCommit !== 'null') {
    const { tree } = JSON.parse(readFile(parentCommit));
    const treeData = path(TREES_DIR, `${tree}.json`);
    const treeObj = parseTreeJson(treeData);
    return compareFiles({
      prev: treeObj,
      curr: filteredIgnoreFiles,
    });
  }
  return filteredIgnoreFiles;
};

/**
 * convert object provided to string
 * and hash it in sha256
 * return an object of string + its hash
 */
const createHashObj = (dataObj) => {
  const stringData = JSON.stringify(dataObj, null, 2);
  const hash = hashInSHA(stringData);
  return { data: stringData, hash };
};

/**
 * update Tree/root file
 * registers current commit to all commits
 * also adds current commit's parent commit
 * to help parse tree
 */
const updateTreeStruct = (nodeToAdd) => {
  const allCommits = JSON.parse(readFile(TREE_STRUCT));
  allCommits.push(nodeToAdd);
  const updatedData = JSON.stringify(allCommits, null, 2);
  fs.writeFileSync(TREE_STRUCT, updatedData);
};

/**
 * initialise repository
 */
const onInit = () => {
  const DEST_PATH = args.length === 1 ? cwd : path(args[1]);
  if (!fs.existsSync(DEST_PATH)) {
    makeDir(DEST_PATH); // create repository folder if not exist
  } else if (!fs.lstatSync(DEST_PATH).isDirectory()) {
    throwError(`
      Invalid path provided ${EOF} -----> Provided path seems to be a file, not a folder
    `);
  }
  const REPO_PATH = path(DEST_PATH, DOT_MYGIT);
  console.log('creating MYGIT repo!!!');
  makeDir(REPO_PATH);
  if (process.platform === 'win32') {
    // if windows then hide using +h attribute
    execSync(`attrib ${REPO_PATH} +h`);
  }
  makeDir(path(DEST_PATH, OBJECTS_DIR));
  makeDir(path(DEST_PATH, TREES_DIR));
  makeDir(path(DEST_PATH, COMMITS_DIR));
  makeDir(path(DEST_PATH, FILES_DIR));
  makeDir(path(DEST_PATH, BRANCHES_DIR));
  console.log('initialising working tree!!!');
  makeFile({
    fileName: path(DEST_PATH, CONFIG_FILE),
    content: 'master',
  });
  makeFile({
    fileName: path(DEST_PATH, BRANCHES_DIR, 'master'),
    content: 'no-commits',
  });
  makeFile({
    fileName: path(DEST_PATH, TREE_STRUCT),
    content: '[]',
  });
  console.log('repository initialised!!!');
  console.log(`repository location: ${DEST_PATH}`);
};

/**
 * commit changes
 */
const onCommit = () => {
  if (!fs.existsSync(DOT_MYGIT) || !fs.lstatSync(DOT_MYGIT).isDirectory()) {
    throwError(`
      'the current working directory is not a {MyGit} repository!!!'
    `);
  }
  console.log('matching branch...');
  const currBranch = readFile(path(CONFIG_FILE));
  console.log('fetching ignores if present...');
  const toIgnore = listItemsToIgnore();
  console.log('matching with present commit(s) data...');
  const prevCommitHash = readFile(path(BRANCHES_DIR, currBranch));
  // eslint-disable-next-line operator-linebreak
  const parentCommit =
    prevCommitHash === 'no-commits' ? 'null' : path(COMMITS_DIR, `${prevCommitHash}.json`);
  console.log('checking changes...');
  const filesList = getFilesListToCommit({
    dir: cwd,
    root: cwd,
    parentCommit,
    toIgnore,
  });
  console.log(filesList);
  console.log('initialising tree for current commit!!!');
  const fileHashesArr = filesList.map((file) => {
    const fileData = readFile(file);
    return {
      file,
      hash: hashInSHA(fileData),
    };
  });
  const TREE = createHashObj(fileHashesArr);
  console.log('writing working tree!!!');
  fs.writeFileSync(path(TREES_DIR, `${TREE.hash}.json`), TREE.data);
  console.log('writing objects to version control data...');
  fileHashesArr.forEach(({ file, hash }) => {
    const hashedFileName = path(FILES_DIR, hash);
    const fileData = readFile(file);
    fs.writeFileSync(hashedFileName, fileData);
  });
  console.log('writing commit data...');
  const commitData = {
    tree: TREE.hash,
    parent: prevCommitHash,
    author: process.env.USER || 'MYGIT USER',
    date: new Date().toString(),
    message: args[1] || 'new commit',
  };
  const COMMIT = createHashObj(commitData);
  // writing commit data
  fs.writeFileSync(path(COMMITS_DIR, `${COMMIT.hash}.json`), COMMIT.data);
  console.log(`updating ${currBranch}...`);
  fs.writeFileSync(path(BRANCHES_DIR, currBranch), COMMIT.hash);
  console.log('writing commit data complete!!!');
  updateTreeStruct({
    commit: COMMIT.hash,
    parent: prevCommitHash,
    date: commitData.date,
  });
  console.log('tree updated!!!');
  // update branch
};

/* handle CLI input */

if (args[0] === 'init') {
  onInit();
} else if (args[0] === 'commit') {
  onCommit();
} else {
  throwError(`
    Invalid execution of {mygit}, command not found!!!
  `);
}
