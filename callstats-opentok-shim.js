let CallstatsOpenTok = (function() {
  let connections   = new Map();
  let callstatsConn = null;
  let idGenerator   = generateUUID;
  let sessionId     = null;
  let onConnection  = null;

  function generateUUID() {
    let d = new Date().getTime();
    let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      let r = (d + Math.random()*16)%16 | 0;
      return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
  };

  function wrapError(pc, fnName, failure) {
    return (err) => {
      if(callstatsConn !== null) {
        let webRtcFunc = callstatsConn.webRTCFunctions[fnName];
        callstatsConn.reportError(pc, sessionId, webRtcFunc);
      }
      return failure(err);
    };
  }

  function getConnections() {
    let copy = new Map();
    connections.forEach((v, k) => {
      copy.set(k, v);
    });
    return copy;
  }

  function initialize(params) {
    let connId = null;
    if(typeof(params.IdGenerator) === 'function') {
      idGenerator = params.IdGenerator;
    }
    if(params.AppId === undefined) {
      console.error('callstats AppId is required');
      return;
    }
    if(params.AppSecret === undefined) {
      console.error('callstats AppSecret is required');
      return;
    }
    if(params.SessionId === undefined) {
      console.error('callstats SessionId is required');
      return;
    } else {
      sessionId = params.SessionId;
    }
    if(typeof(params.OnConnection) === 'function') {
      onConnection = params.OnConnection;
    }

    if(params.Id !== undefined) {
      connId = params.Id;
    } else {
      console.info('Stats identifier not provided. Generating one ...');
      connId = idGenerator();
    }
    callstatsConn = new callstats();
    callstatsConn.initialize(params.AppId, params.AppSecret, connId);

    return callstatsConn;
  }

  let origPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  if (origPeerConnection) {
    let newPeerConnection = function(config, constraints) {
      let pc = new origPeerConnection(config, constraints);
      let uuid = idGenerator();
      let kind;
      if(config === undefined) {
        kind = 'unknown';
      } else {
        kind = config.capableSimulcastStreams ? 'publisher' : 'subscriber'
      }
      connections.set(uuid, {
        peerConnection: pc, 
        kind
      });
      
      if(callstatsConn !== null) {
        let usage = callstatsConn.fabricUsage.multiplex;
        callstatsConn.addNewFabric(pc, uuid, usage, sessionId, (err, msg) => {
          console.log("Monitoring status: " + err + " msg: " + msg);
        });
      } else {
        console.warn('Callstats not connected');
      }

      let origGetStats = pc.getStats.bind(pc);
      pc.getStats = function(success, failure) {
        let successWrap = function(res) {
          onConnection && onConnection(uuid, pc);
          if (success) {
            return success(res);
          };
        };
        return origGetStats(successWrap, failure);
      };

      let origCreateOffer = pc.createOffer.bind(pc);
      pc.createOffer = function(success, failure, constraints) {
        let failureWrap = wrapError(pc, 'createOffer', failure);
        return origCreateOffer(success, failureWrap, constraints);
      };

      let origCreateAnswer = pc.createAnswer.bind(pc);
      pc.createAnswer = function(success, failure, constraints) {
        let failureWrap = wrapError(pc, 'createAnswer', failure);
        return origCreateAnswer(success, failureWrap, constraints);
      };

      let origSetLocalDescription = pc.setLocalDescription.bind(pc);
      pc.setLocalDescription = function(sdp, success, failure) {
        let failureWrap = wrapError(pc, 'setLocalDescription', failure);
        return origSetLocalDescription(sdp, success, failureWrap);
      };

      let origSetRemoteDescription = pc.setRemoteDescription.bind(pc);
      pc.setRemoteDescription = function(sdp, success, failure) {
        let failureWrap = wrapError(pc, 'setRemoteDescription', failure);
        return origSetRemoteDescription(sdp, success, failureWrap);
      };

      let origAddIceCandidate = pc.addIceCandidate.bind(pc);
      pc.addIceCandidate = function(candidate, success, failure) {
        let failureWrap = wrapError(pc, 'addIceCandidate', failure);
        return origAddIceCandidate(candidate, success, failureWrap);
      };

      pc.onsignalingstatechange = function(event) {
        if (event.signalingState == 'closed') {
          connections.delete(uuid);
        }
      };

      return pc;
    };

    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection'].forEach(obj => {
        // Override objects if they exist in the window object
        if (window.hasOwnProperty(obj)) {
            window[obj] = newPeerConnection;

            // Copy the static methods (generateCertificate in this case)
            Object.keys(origPeerConnection).forEach(x => {
                window[obj][x] = origPeerConnection[x];
            });
            window[obj].prototype = origPeerConnection.prototype;
        }
    });
  }

  return {
    initialize: initialize,
    getConnections: getConnections
  };
})();
