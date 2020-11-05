/*! callstats-opentok-shim  version = 1.0.3 */
let CallstatsOpenTok = (function() {
  let connections   = new Map();
  let callstatsConn = null;
  let idGenerator   = generateUUID;
  let sessionId     = null;
  let onConnection  = null;
  let connId = null;
  let remoteId = null;

  const fabricEvents = {
    audioMute: 'audioMute',
    audioUnmute: 'audioUnmute',
    videoPause: 'videoPause',
    videoResume: 'videoResume',
    screenShareStart: 'screenShareStart',
    screenShareStop: 'screenShareStop',
    dominantSpeaker: 'dominantSpeaker',
  }

  function isPCTPc(pcConfig) {
    if (!pcConfig.iceServers) {
      return false;
    }
    const len = pcConfig.iceServers.length;
    for (let i = 0; i < len; i++) {
      const username = pcConfig.iceServers[i].username;
      if (username && username.includes('pct')) {
        return true;
      }
    }
    return false;
  }

  // note : currently we are assuming for bandwidth estimation/connectivity check/or what other reason
  // tokbox is creating shortliving peerconnection does not have pc constraints
  // todo : make educative guess
  function isShortCall(constraints) {
    if (!constraints) {
      return true;
    }
    return false;
  }

  function generateUUID() {
    let d = new Date().getTime();
    let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      let r = (d + Math.random()*16)%16 | 0;
      return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
  };

  function reportError(pc, fnName) {
    if (callstatsConn !== null) {
      const webRtcFunc = callstatsConn.webRTCFunctions[fnName];
      callstatsConn.reportError(pc, sessionId, webRtcFunc);
    }
  }

  function wrapError(pc, fnName, failure) {
    return (err) => {
      reportError(pc, fnName);
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

  function sendFabricEvent(eventName) {
    if (!sessionId) {
      console.warn('Not initialized');
      return;
    }
    if (!eventName) {
      console.warn('sendFabricEvent: Invalild Arguments');
      return;
    }
    if (!(fabricEvents.hasOwnProperty(eventName))) {
      console.warn('sendFabricEvent: Unsupported event');
      return;
    }

    const fabrics = getConnections();
    for (const [key, value] of fabrics) {
      if (value && value.kind === "publisher") {
        if (value.peerConnection && (value.peerConnection.iceConnectionState === 'connected' 
          || value.peerConnection.iceConnectionState === 'completed')) {
            callstatsConn.sendFabricEvent(value.peerConnection, eventName, sessionId);
          }
      }
    }
  }

  function sendUserFeedback(feedback) {
    if (!sessionId) {
      console.warn('Not initialized');
      return;
    }
    if (!feedback) {
      console.warn('sendUserFeedback: Invalild Arguments');
      return;
    }
    callstatsConn.sendUserFeedback(sessionId, feedback);
  }

  function initialize(params) {
    connId = null;
    remoteId = null;
    connections   = new Map();
    sessionId = null;

    let statsCallback = null;
    let initCallback = null;
    let configParams = null;

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
      console.info('Local identifier not provided. Generating one ...');
      connId = idGenerator();
    }

    if(params.RemoteId) {
      remoteId = params.RemoteId;
    }

    if (params.InitCallback) {
      initCallback = params.InitCallback;
    }

    if (params.StatsCallback) {
      statsCallback = params.StatsCallback;
    }

    if (params.ConfigParams) {
      configParams = params.ConfigParams;
    }
    callstatsConn = new callstats();
    callstatsConn.initialize(params.AppId, params.AppSecret, connId, initCallback, statsCallback, configParams);

    return callstatsConn;
  }

  let origPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  if (origPeerConnection) {
    let newPeerConnection = function(config, constraints) {
	    const pc = new origPeerConnection(config, constraints);
	    // if it is PCT pc then ignore
      if (isPCTPc(config) || isShortCall(constraints)) {
        return pc;
      }
      let uuid = idGenerator();
      let remoteUuid = uuid;
      if (remoteId) {
        remoteUuid = remoteId;
      }
      let kind;
      if (config === undefined) {
        kind = 'unknown';
      } else {
        kind = config.capableSimulcastStreams ? 'publisher' : 'subscriber'
      }
      connections.set(uuid, {
        peerConnection: pc,
        kind
      });

      if(callstatsConn !== null) {
        const usage = callstatsConn.fabricUsage.multiplex;
        callstatsConn.addNewFabric(pc, remoteUuid, usage, sessionId, (err, msg) => {
          console.log("Monitoring status: " + err + " msg: " + msg);
        });
      } else {
        console.warn('Callstats not connected');
      }

      const origGetStats = pc.getStats.bind(pc);
      pc.getStats = function(...args) {
        if(args.length <= 1) {
          onConnection && onConnection(uuid, pc);
          return origGetStats(...args).catch(ex => {
            reportError(pc, 'getStats');
            throw ex;
          });
        } else{
          const [success, failure] = args;
          const successWrap = function(res) {
            onConnection && onConnection(uuid, pc);
            if (success) {
              return success(res);
            };
          };
          return origGetStats(successWrap, failure);
        }
      };

      const origCreateOffer = pc.createOffer.bind(pc);
      pc.createOffer = function(...args) {
        if(args.length <= 1) {
          return origCreateOffer(...args).catch(ex => {
            reportError(pc, 'createOffer');
            throw ex;
          });
        } else {
          const [constraints, success, failure] = args;
          const failureWrap = wrapError(pc, 'createOffer', failure);
          return origCreateOffer(constraints, success, failure, failureWrap);
        }
      };

      const origCreateAnswer = pc.createAnswer.bind(pc);
      pc.createAnswer = function(...args) {
        if (args.length <= 1) {
          return origCreateAnswer(...args).catch(ex => {
            reportError(pc, 'createAnswer');
            throw ex;
          });
        } else {
          const [constraints, success, failure] = args;
          const failureWrap = wrapError(pc, 'createAnswer', failure);
          return origCreateAnswer(constraints, success, failureWrap);
        }
      };

      const origSetLocalDescription = pc.setLocalDescription.bind(pc);
      pc.setLocalDescription = function(...args) {
        if (args.length <= 1) {
          return origSetLocalDescription(...args).catch(ex => {
            reportError(pc, 'setLocalDescription');
            throw ex;
          });
        } else {
          const [sdp, success, failure] = args;
          const failureWrap = wrapError(pc, 'setLocalDescription', failure);
          return origSetLocalDescription(sdp, success, failureWrap);
        }
      };

      const origSetRemoteDescription = pc.setRemoteDescription.bind(pc);
      pc.setRemoteDescription = function (...args) {
        if (args.length <= 1) {
          return origSetRemoteDescription(...args).catch(ex => {
            reportError(pc, 'setRemoteDescription');
            throw ex;
          });
        } else {
          const [sdp, success, failure] = args;
          const failureWrap = wrapError(pc, 'setRemoteDescription', failure);
          return origSetRemoteDescription(sdp, success, failureWrap);
        }
      };

      const origAddIceCandidate = pc.addIceCandidate.bind(pc);
      pc.addIceCandidate = function(...args) {
        if (args.length <= 1) {
          return origAddIceCandidate(...args).catch(ex => {
            reportError(pc, 'addIceCandidate');
            throw ex;
          });
        } else {
          const [candidate, success, failure] = args;
          const failureWrap = wrapError(pc, 'addIceCandidate', failure);
          return origAddIceCandidate(candidate, success, failureWrap);
        }
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
    getConnections: getConnections,
    sendUserFeedback: sendUserFeedback,
    sendFabricEvent: sendFabricEvent,
    fabricEvents: fabricEvents,
  };
})();
