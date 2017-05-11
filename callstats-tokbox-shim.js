var connectionsDict = {};
var currentUUID = null;
var localUUID = null;

function queryParams() {
  var m = {};
  for (let p of window.location.search.substring(1).split("&")) {
    p = p.split("=");
    m[p[0]] = p[1]
  }
  return m
}

if (typeof(generateUUID) != "function") {
  function generateUUID() {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = (d + Math.random()*16)%16 | 0;
      return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
  };
}

if (queryParams().from) {
  localUUID = queryParams().from;
} else {
  localUUID = generateUUID();
}

var callstatsConn = new callstats();
callstatsConn.initialize(AppId, AppSecret, localUUID);

(function() {
  var origPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  if (origPeerConnection) {
    var newPeerConnection = function(config, constraints) {
	    var pc = new origPeerConnection(config, constraints);

      var uuid = null;
      if (queryParams().to) {
        uuid = queryParams().to;
      } else {
        uuid = generateUUID();
      }

      connectionsDict[uuid] = { 'peerConnection': pc, 'kind': config.capableSimulcastStreams ? 'publisher' : 'subscriber' };

      var usage = callstatsConn.fabricUsage.multiplex;
      callstatsConn.addNewFabric(pc, uuid, usage, session.id, function(err, msg) { console.log("Monitoring status: " + err + " msg: " + msg); } );

	    var origGetStats = pc.getStats.bind(pc);
	    pc.getStats = function(f) {
	    	var wrapper = function(res) {
          currentUUID = uuid;
			    if (f) {
	    		  return f(res)
			    };
	    	};
	    	return origGetStats(wrapper);
	    };

      var origCreateOffer = pc.createOffer.bind(pc);
      pc.createOffer = function(success, failure, constraints) {
        var errWrapper = function(err) {
          callstatsConn.reportError(pc, session_id, callstatsConn.webRTCFunctions.createOffer, err);
          return failure(err);
        }
        return origCreateOffer(success, errWrapper, constraints);
      };

      var origCreateAnswer = pc.createAnswer.bind(pc);
      pc.createAnswer = function(success, failure, constraints) {
        var errWrapper = function(err) {
          callstatsConn.reportError(pc, session_id, callstatsConn.webRTCFunctions.createAnswer, err);
          return failure(err);
        }
        return origCreateAnswer(success, errWrapper, constraints);
      };

      var origSetLocalDescription = pc.setLocalDescription.bind(pc);
      pc.setLocalDescription = function(sdp, success, failure) {
        var errWrapper = function(err) {
          callstatsConn.reportError(pc, session_id, callstatsConn.webRTCFunctions.setLocalDescription, err);
          return failure(err);
        }
        return origSetLocalDescription(sdp, success, errWrapper);
      };

      var origSetRemoteDescription = pc.setRemoteDescription.bind(pc);
      pc.setRemoteDescription = function(sdp, success, failure) {
        var errWrapper = function(err) {
          callstatsConn.reportError(pc, session_id, callstatsConn.webRTCFunctions.setRemoteDescription, err);
          return failure(err);
        }
        return origSetRemoteDescription(sdp, success, errWrapper);
      };

      var origAddIceCandidate = pc.addIceCandidate.bind(pc);
      pc.addIceCandidate = function(candidate, success, failure) {
        var errWrapper = function(err) {
          callstatsConn.reportError(pc, session_id, callstatsConn)
          return failure(err);
        }
        return origAddIceCandidate(candidate, success, errWrapper);
      };

      pc.onsignalingstatechange = function(event) {
        if (event.signalingState == 'closed') {
          connectionsDict.delete(uuid);
        }
      };

      return pc;
    };

    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection'].forEach(function(obj) {
        // Override objects if they exist in the window object
        if (window.hasOwnProperty(obj)) {
            window[obj] = newPeerConnection;
            // Copy the static methods (generateCertificate in this case)
            Object.keys(origPeerConnection).forEach( function(x) {
                window[obj][x] = origPeerConnection[x];
            });
            window[obj].prototype = origPeerConnection.prototype;
        }
    });
  }
})();
