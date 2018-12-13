
'use strict';

const httpTestURL = "http://connectivity.jsweb.eu/generate_204";
const httpsTestURL = "https://connectivity.js-web.eu/generate_204";
const iceServer = "stun:stun.stunprotocol.org";

const timeout = 5000; // 5s

function tryGet(url, timeout=0) {
    return new Promise(function(resolve, reject) {
        let xhr = new XMLHttpRequest();
        xhr.open('GET', url + "?rand=" + Math.round(Math.random() * 10000), true);
        xhr.send();
        xhr.timeout = timeout;
        xhr.ontimeout = function(e) {
            reject(e);
        }
        xhr.addEventListener("readystatechange", function processRequest(e) {
            console.log("x-ssn-problem", xhr.getResponseHeader('x-ssn-problem'));
            if (xhr.readyState == xhr.HEADERS_RECEIVED) {
                console.log(xhr.getAllResponseHeaders());
            } else if (xhr.readyState == xhr.DONE) {
                resolve(xhr);
            }
        }, false);
    });
}

function getIPInfo() {
    return new Promise(function(resolve, reject) {
        tryGet("/status", timeout).then(function(xhr) {
            console.log(xhr);

            // TODO: Check X-SSN-PROBLEM == BLOCKED || NOMEMBER

            if (xhr.status == 204) {
                resolve("OK");
            } else if (xhr.status == 302) {
                // TODO: check redirect URL
                resolve("Proxy Required");
            } else if (xhr.status == 200) {
                resolve("Intercepted");
            } else {
                console.log(xhr.status);
                console.log("x-ssn-problem", xhr.getResponseHeader('x-ssn-problem'));
                resolve("FAIL");
            }
        }).catch(function(err) {
            resolve(err);
        });
    });
}

function checkStatus(url) {
    return new Promise(function(resolve, reject) {
        tryGet(url, timeout).then(function(xhr) {
            console.log(xhr);

            // TODO: Check X-SSN-PROBLEM == BLOCKED || NOMEMBER

            if (xhr.status == 204) {
                resolve("OK");
            } else if (xhr.status == 302) {
                // TODO: check redirect URL
                resolve("Proxy Required");
            } else if (xhr.status == 200) {
                resolve("Intercepted");
            } else {
                console.log(xhr.status);
                console.log("x-ssn-problem", xhr.getResponseHeader('x-ssn-problem'));
                resolve("FAIL");
            }
        }).catch(function(err) {
            resolve(err);
        });
    });
}

function ice() {
    return new Promise(function(resolve, reject) {
        const config = {
            iceServers: [{
                urls: iceServer
            }],
            iceTransportPolicy: "all",
            iceCandidatePoolSize: 0
        };

        let best = null;
        let pc = new RTCPeerConnection(config);
        pc.onicecandidate = function(event) {
            if (event.candidate) {
                const text = event.candidate.candidate;
                const prefix = 'candidate:';
                const pos = text.indexOf(prefix) + prefix.length;
                const fields = text.substr(pos).split(' ');
                const candidate = {
                    'priority': fields[3],
                    'protocol': fields[2],
                    'address': fields[4],
                    'port': parseInt(fields[5]),
                    'type': fields[7]
                };
                if (best === null || best.priority >= candidate.priority) {
                    best = candidate;
                }
            } else if (!('onicegatheringstatechange' in RTCPeerConnection.prototype)) {
                pc.close();
                pc = null;
                resolve(best);
            }
        };
        pc.onicegatheringstatechange = function() {
            if (pc.iceGatheringState !== 'complete') {
                return;
            }
            pc.close();
            pc = null;
            resolve(best);
        };
        pc.createOffer({offerToReceiveAudio: 1}).then(
        function(desc) {
            pc.setLocalDescription(desc);
        },
        function(error) {
            console.log('Error creating offer: ', error);
            reject(error);
        });
    });
}

getIPInfo().then(console.log);
checkStatus(httpTestURL).then(console.log);
checkStatus(httpsTestURL).then(console.log);
ice().then(console.log, console.log);
// if (candidate === null || (candidate.indexOf('141.84.69.') < 0 && candidate.indexOf('129.187.166.15') < 0)) {
