// http://www.image-net.org/api/text/wordnet.structure.hyponym?wnid=n02084071
// http://www.image-net.org/api/text/wordnet.structure.hyponym?wnid=n02084071&full=1
// http://www.image-net.org/api/text/wordnet.synset.getwords?wnid=n02084071
// http://www.image-net.org/api/text/imagenet.synset.geturls?wnid=n02084071
// http://www.image-net.org/api/text/imagenet.synset.geturls.getmapping?wnid=n02084071
// http://www.image-net.org/download/synset?wnid=[wnid]&username=[username]&accesskey=[accesskey]&release=latest&src=stanford

require('./components/bootstrap.js');
const request = require('request');
const inquirer = require('inquirer');
const async = require('async');
const fs = require('fs');
const spawn = require('child_process').spawn;
const _ = require('underscore');
const ProgressBar = require('progress');
const https = require('https');
const http = require('http');

let getChildrenIds = (wnid, callback) => {
  request(`http://www.image-net.org/api/text/wordnet.structure.hyponym?wnid=${wnid}&full=1`, (err, response, body) => {
    if(err) {
      return callback(err);
    }
    else if(response.statusCode != 200) {
      return callback(new Error("Oops. Failed to get children IDs."));
    }

    let childrenIds = body.split("\n")
      .map(x => x.replace("-", ''))
      .map(x => x.trim())
      .filter(x => x);

    return callback(null, childrenIds);
  });
}

let getWordsForId = (wnid, callback) => {
  request(`http://www.image-net.org/api/text/wordnet.synset.getwords?wnid=${wnid}`, (err, response, body) => {
    if(err) {
      return callback(err);
    }
    else if(response.statusCode != 200) {
      return callback(new Error(`Oops. Failed to get words for ID ${wnid}.`));
    }

    return callback(null, body);
  });
}

let getUrlsForId = (wnid, callback) => {
  request(`http://www.image-net.org/api/text/imagenet.synset.geturls?wnid=${wnid}`, (err, response, body) => {
    if(err) {
      return callback(err);
    }
    else if(response.statusCode != 200) {
      return callback(new Error(`Oops. Failed to get URLs for ID ${wnid}.`));
    }

    let urls = body.split("\n")
      .map(x => x.trim())
      .filter(x => x);

    return callback(null, urls);
  });
}

let downloadCategory = (wnid, filename, callback) => {
  if(fs.existsSync(filename)) {
    logger.info(`Tar file ${filename} exists. Skipping download...`)
    return callback();
  }

  let url = `http://www.image-net.org/download/synset?wnid=${wnid}&username=${Consts.USERNAME}&accesskey=${Consts.ACCESSKEY}&release=latest&src=stanford`;
  let file = fs.createWriteStream(filename);
  let downloadRequest = http.get(url, resp => {
    var len = parseInt(resp.headers['content-length'], 10);

    console.log();
    let bar = new ProgressBar('  downloading [:bar] :rate/bps :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: len
    });

    resp.on('data', function (chunk) {
      bar.tick(chunk.length);
    });

    resp.on('end', function () {
      console.log('\n');
    });

    resp.pipe(file);

    file.on('finish', function() {
      file.close(callback);
    });
  });
}

let errorHandler = err => {
  logger.error("Error occured!");
  logger.error(err);
}

inquirer
  .prompt([
    {
      "type": "input",
      "name": "wnids",
      "message": "Please enter the parent WNID(s), comma seperated:"
    },
    {
      "type": "input",
      "name": "label",
      "message": "Please enter the label:"
    },
    {
      "type": "confirm",
      "name": "recursive",
      "message": "Operate recursive?",
      "default": true
    }
  ])
  .then(options => {
    if(!options.wnids) {
      logger.warn("Missing parent WNID(s)!");
      process.exit(1);
      return;
    }
    if(!options.label) {
      logger.warn("Missing label!");
      process.exit(1);
      return;
    }

    let wnids = options.wnids.split(',');
    logger.info(`Found ${wnids.length} WNIDs`);
    let label = options.label.trim();

    try {
      fs.mkdirSync(`./validation`);
      fs.mkdirSync(`./validation/${label}`);
      fs.mkdirSync(`./train`);
      fs.mkdirSync(`./train/${label}`);
      fs.mkdirSync(`./tar`);
      fs.mkdirSync(`./tar/${label}`);
    } catch(ex) {}

    async.each(
      wnids,
      (wnid, next) => {
        logger.info(`Processing WNID ${wnid}...`);

        let processWnids = (childrenIds) => {
          logger.info(`Got ${childrenIds.length} children IDs...`)

          async.eachOfLimit(
            childrenIds,
            Consts.CONCURRENCY,
            (childId, index, done) => {
              logger.debug(`[${index+1}/${childrenIds.length}] Downloading ${wnid}...`)

              downloadCategory(childId, `./tar/${label}/${childId}.tar`, err => {
                if(err) {
                  logger.warn(`Failed to download child category ${childId}!`, err);
                }

                let untar = spawn('tar', ['-C', `train/${label}`, '-xf', `./tar/${label}/${childId}.tar`]);
                untar.stdout.on('data', (data) => {
                  logger.info(`stdout: ${data}`);
                });
                untar.stderr.on('data', (data) => {
                  logger.info(`stderr: ${data}`);
                });
                untar.on('close', (code) => {
                  logger.info(`child process exited with code ${code}`);

                  let files = fs.readdirSync(`./train/${label}`);
                  let numberOfValidationFiles = Math.floor(files.length * (Consts.VALIDATION_SPLIT / 100));
                  logger.info(`Extracting ${numberOfValidationFiles} validation images...`);

                  let validationFiles = _.sample(files, numberOfValidationFiles);
                  validationFiles.forEach(file => {
                    fs.renameSync(`./train/${label}/${file}`, `./validation/${label}/${file}`);
                  });

                  return done();
                });
              });
            },
            err => next(err)
          );
        }

        if(options.recursive) {
          getChildrenIds(wnid, (err, childrenIds) => {
            if(err) {
              return next(err);
            }

            return processWnids(childrenIds)
          });
        }
        else {
          return processWnids([wnid]);
        }
      },
      err => {
        if(err) {
          logger.warn("Failed!", err);
        }
        else {
          logger.info("Done!");
        }

        return process.exit(1);
      }
    );
  })
  .catch(errorHandler);
