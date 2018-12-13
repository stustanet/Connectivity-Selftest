
'use strict';

const httpTestURL = "http://connectivity.jsweb.eu/generate_204";
const httpsTestURL = "https://connectivity.js-web.eu/generate_204";
const iceServer = "stun:stun.l.google.com:19302"; //"stun:stun.stunprotocol.org";

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
            // if (xhr.readyState == xhr.HEADERS_RECEIVED) {
            //     console.log(xhr.getAllResponseHeaders());
            // }
            if (xhr.readyState == xhr.DONE) {
                resolve(xhr);
            }
        }, false);
    });
}

function getIPInfo() {
    return new Promise(function(resolve, reject) {
        tryGet("/status", timeout).then(function(xhr) {
            console.log(xhr);
            if (xhr.status == 200 && xhr.getResponseHeader('content-type') == 'application/json') {
                let res = JSON.parse(xhr.response);
                document.getElementById('ip').innerHTML = res.ip;
                showBox('info-ip');
                if (!res.ssn) {
                    showBox('error-external');
                    reject("EXTERNAL");
                } else {
                    resolve(res);
                }
            } else {
                console.log(xhr.status);
                showBox('error-unknown');
                reject("FAIL");
            }
        }).catch(function(err) {
            showBox('error-unknown');
            reject(err);
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
                console.log("x-ssn-problem", xhr.getResponseHeader('x-ssn-problem'));
                showBox('error-proxy');
                reject("NOPROXY");
            } else if (xhr.status == 200) {
                showBox('error-unknown');
                reject("INTERCEPTED"); // TODO
            } else {
                console.log(xhr.status);
                let problem = xhr.getResponseHeader('x-ssn-problem');
                console.log("x-ssn-problem", problem);
                if (problem == "BLOCKED") {
                    showBox('error-blocked');
                    reject("BLOCKED");
                } else {
                    showBox('error-unknown');
                    reject("FAIL");
                }
            }
        }).catch(function(err) {
            showBox('error-unknown');
            reject(err);
        });
    });
}

function ice() {
    return new Promise(function(resolve, reject) {
        const config = {
            iceServers: [{
                urls: iceServer,
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
                console.log(candidate);
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

function sleep(ms) {
    return new Promise(function(resolve) {
        window.setTimeout(resolve, ms);
    });
}

function runTest(index, testFunc) {
    console.log("test", index, Date.now());
    const status = getStatusColumn(index);
    return new Promise(function(resolve, reject) {
        markRunning(status);
        sleep(500).then(function(res) {
            testFunc().then(function(res) {
                console.log(index, res);
                markOK(status);
                resolve(res);
            }, function(err) {
                markFailed(status);
                skipRemainingTests(index);
                reject(err);
            })
        });

    });
}

function showBox(name) {
    document.getElementById(name).classList.add('show');
}

function markRunning(elem) {
    elem.innerHTML = 'Running';
    elem.className = 'running';
}

function markOK(elem) {
    elem.innerHTML = 'OK';
    elem.className = 'ok';
}

function markFailed(elem) {
    elem.innerHTML = 'Fail';
    elem.className = 'fail';
}

function markSkipped(elem) {
    elem.innerHTML = 'Skipped';
    elem.className = 'warn';
}

function getStatusColumn(index) {
    return document.querySelector('#tests tr:nth-child('+(index+1)+') td:nth-child(3)');
}

function skipRemainingTests(index) {
    let i = 0;
    document.querySelectorAll('#tests td:nth-child(3)').forEach(function(elem) {
        if (i > index) {
            markSkipped(elem);
        }
        i++;
    });
}

sleep(500).then(function(res) {
    document.getElementById('status').innerHTML = "Performing Tests ...";
    return runTest(0, function() {
        return getIPInfo();
    });
}).then(function(res) {
    return runTest(1, function() {
        return checkStatus(httpTestURL);
    });
}).then(function(res) {
    return runTest(2, function() {
        return checkStatus(httpsTestURL);
    });
}).then(function(res) {
    return runTest(3, function() {
        // if (candidate === null || (candidate.indexOf('141.84.69.') < 0 && candidate.indexOf('129.187.166.15') < 0)) {
        return ice();
    });
}).then(function(res) {
    document.getElementById('status').innerHTML = "Done!"
}).catch(function(err) {
    console.log(err);
    document.getElementById('status').innerHTML = "Problems detected!"
});
