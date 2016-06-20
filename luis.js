'use strict';

//import * as https from 'https';
let https = require('https');
let uuid = require('uuid');

const LUIS_HOSTNAME = `api.projectoxford.ai`;
const LUIS_PORT = 443;
const LUIS_BASE_PATH = `/luis/v1.0/prog/apps/`;

function urlEncode(obj) {
  const list = [];
  Object.keys(obj).forEach(key => {
    list.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
  });
  return list.join(`&`);
}

let log = {
  info: console.log,
  debug: console.log,
  error: console.log,
  verose: console.log,
}

class Luis {
  constructor(options) {
    this._appId = options.appId;
    this._subscriptionKey = options.subscriptionKey;
  }

  _req(method, resource, data) {
    data = JSON.stringify(data);
 
    let opts = {
      hostname: LUIS_HOSTNAME,
      port: LUIS_PORT,
      path: LUIS_BASE_PATH + this._appId + '/' + resource,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Ocp-Apim-Subscription-Key': this._subscriptionKey,
      },
    };

    log.info('http request: ' + JSON.stringify(opts));

    return new Promise((resolve, reject) => {
      const req = https.request(opts, (res) => {
        let json = '';
        res.once('error', error => reject(error));
        res.on('data', chunk => json += chunk);
        res.once('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            log.info(`Request complete`);
            if (method === 'GET') {
              json = JSON.parse(json);
            }
            log.debug(json);
            resolve(json);
          } else {
            log.error(json);
            reject(new Error(`Request failed: ` + `${res.statusCode}`));
          }
        });
      });
      log.debug('http request data: ' + data);
      req.write(data);
      req.end();
    });
  }

  get(resource, data) {
    return this._req('GET', resource, data);
  }

  post(resource, data) {
    return this._req('POST', resource, data);
  }

  delete(resource, data) {
    return this._req('DELETE', resource, data);
  }

  _doAllParallel(funcs) {
    let promises = [];

    for (let func of funcs) {
      promises.push(func());
    }
    return Promise.all(promises);
  }

  _doAllSerial(funcs) {
    let promise = Promise.resolve();

    for (let func of funcs) {
      promise = promise.then(() => func());
      //.then(() => new Promise(resolve => setTimeout(resolve, 0)));
    }
    return promise;
  }

  _checkClassifierType(type) {
    if (type !== 'intents' && type !== 'entities' && type !== 'prebuilts') {
      throw new Error(`${type} is an invalid classifier type`);
    }
  }

  _addClassifiers(type, names) {
    log.info(`Adding ${type} classifier`);
    let funcs = [];

    this._checkClassifierType(type);

    for (let name of names) {
      funcs.push(() => {
        log.info(`Adding ${type} classifier: ${name}`);
        return this.post(type, { Name: name, children: {} });
      });
    }
    return this._doAllSerial(funcs);
  }

  _removeAllClassifiers(type) {
    log.info(`Removing all ${type} classifiers`);

    this._checkClassifierType(type);

    return this.get(type, {}) 
    .then(classifiers => {
      let funcs = []; 

      for (let classifier of classifiers) {
        funcs.push(() => {
          if (type === 'intents' && classifier.Name === 'None') {
            log.info(`Not removing 'None' intent: ${classifier.ID}`);
            return;
          } else {
            log.info(`Removing ${type} classifier: ${classifier.ID}`);
            return this.delete(type + '/' + classifier.ID, {})
          }
        });
      }
      return this._doAllSerial(funcs);
    });
  }

  addEntities(names) {
    return this._addClassifiers('entities', names);
  }

  removeAllEntities() {
    return this._removeAllClassifiers('entities');
  }

  addIntents(names) {
    return this._addClassifiers('intents', names);
  }

  removeAllIntents() {
    return this._removeAllClassifiers('intents');
  }

  addPrebuilts(names) {
    // TODO: not working yet, need MSFT to explain POST format
    //return this._addClassifiers('prebuilts', names);
  }

  removeAllPrebuilts() {
    return this._removeAllClassifiers('prebuilts');
  }

}

let luis = new Luis({
  appId: '74202f4c-0c94-4b48-a847-04d7154f1854',
  subscriptionKey: '929a376180624437bc881e4501940e3e'
});

let intents = [ 'end', 'reject', 'switch', 'cancel', 'startBottleFeeding',
    'register', 'startNursing', 'startFeeding', 'rename', 'confirm' ];

let entities = [ 'formula', 'bottle', 'breast milk', 'nursing', 'milliliter',
    'side', 'baby' ];

let prebuilts = [ 'number' ];

Promise.resolve()
.then(() => luis.removeAllIntents()).then(() => luis.addIntents(intents))
.then(() => luis.removeAllEntities()).then(() => luis.addEntities(entities))
//.then(() => luis.removeAllPrebuilts()).then(() => luis.addPrebuilts(prebuilts))
.then(() => log.info('done!') )
.catch(e => log.error(e) );

