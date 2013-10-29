var gcm = require('dpush'),
    responder = require('../responder'),
    log  = require('../log').logger,
    auth = require('../auth');

var config = require('../config.json');

function sendMessage(request, response) {
  var payload = request.body.notification;

  log.debug(JSON.stringify(payload));

  try {
    gcm.send(request.body.key, request.body.deviceId, payload, function (err, res) {
      if (err) {
        var error;

        if (err.toString().match("400")) {
          error = 'Invalid Payload';
        } else if (err.toString().match("401")) {
          error = 'Bad Key';
        } else {
          error = 'Unknown Error';
        }
        response.end(responder.err({ error: error }));
      } else {
        // we should only be sending a single id
        if (res.failure) {
          if (res.invalidIds && res.invalidIds.length) {
            response.end(responder.err({ error: "Invalid Device ID", invalidIds: res.invalidIds }));
          } else if (res.updatedIds && res.updatedIds.length) {
            response.end(responder.err({ error: "Updated Device ID", updatedIds: res.updatedIds }));
          } else {
            response.end(responder.err({ error: "Unknown Error" }));
          }
        } else {
          response.end(responder.ok());
        }
      }
    });
  } catch (majorError) {
    response.end(responder.err({ error: majorError.toString() }));
  }
}

function authCallback(err, replies, request, response, appId, mode) {
  if (replies === undefined || replies.length !== 1 || replies[0] === null) {
    log.debug("No GCM key found in Redis for "+appId+" ("+mode+")");
    response.end(responder.err({ error: "Missing Key" }));
  } else {
    log.debug("Found a GCM key in Redis for "+appId+" ("+mode+")");
    request.body.key = replies[0];

    sendMessage(request, response);
  }
}

function getAuthData(appId, mode) {
  return [ [ "get", authKeyString(appId, mode) ] ]
}

// we expect cert to be nil
function setAuthData(appId, mode, key, cert) {
  return [ [ "set", authKeyString(appId, mode), key] ]
}

function authKeyString(appId, mode) {
  return appId + "_" + mode + "_gcmkey";
}

function authProvided(request) {
  return (request.body.key !== undefined);
}

// entry for the module, handle the message
function handleMessage (request, response) {

  if (authProvided(request)) {
    // If a key is provided, store it in redis
    log.debug("New auth provided in request");
    auth.handleNewAuth(request, response, setAuthData, sendMessage);
  } else {
    log.debug("No auth provided, attempt to look up in the cache");
    auth.handleExistingAuth(request, response, getAuthData, authCallback);
  }
}

exports.handleMessage = handleMessage;
exports.sendMessage   = sendMessage;
exports.setAuthData   = setAuthData;
exports.getAuthData   = getAuthData;
exports.authCallback  = authCallback;
