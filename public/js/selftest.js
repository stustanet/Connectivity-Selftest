
'use strict';

const httpTestURL = "http://conntest.stustanet.de/generate_204";
const httpsTestURL = "https://conntest.stustanet.de/generate_204";
const iceServer = "stun:conntest.stustanet.de:3478";

const timeout = 10000; // 10s

let noMember = false;

function isIncompatibleBrowser() {
    let ua = window.navigator.userAgent;
    let isIE = /msie\s|trident\/|edge\//i.test(ua) &&
        !!(document.uniqueID || document.documentMode || window.ActiveXObject || window.MSInputMethodContext || window.MSSiteModeEvent);

    return isIE;
}

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
            if (xhr.readyState == xhr.DONE) {
                resolve(xhr);
            }
        }, false);
    });
}

function getIPInfo() {
    return new Promise(function(resolve, reject) {
        log("Getting IP Info ...");
        tryGet("/status", timeout).then(function(xhr) {
            if (xhr.status == 200 && xhr.getResponseHeader('content-type') == 'application/json') {
                let res = JSON.parse(xhr.response);
                document.getElementById('ip').innerHTML = res.ip;
                log("IP: "+res.ip);
                log("SSN IP: "+res.ssn);
                showBox('info-ip');
                if (!res.ssn) {
                    showBox('error-external');
                    reject("EXTERNAL");
                } else {
                    resolve(res);
                }
            } else {
                if (xhr.status === 0 && xhr.statusText == "") {
                    log("Request was blocked by the browser!")
                } else {
                    log(xhr.status + " " + xhr.statusText);
                }
                showUnknown();
                reject("FAIL");
            }
        }).catch(function(err) {
            log("Exception: " + err)
            showUnknown();
            reject(err);
        });
    });
}

function checkStatus(url) {
    return new Promise(function(resolve, reject) {
        log("Performing test request to " + url + " ...");
        tryGet(url, timeout).then(function(xhr) {
            switch (xhr.status) {
                case 200:
                case 511:
                    const problem = xhr.getResponseHeader('x-ssn-problem');
                    log("X-SSN-Problem: " + problem);
                    switch (problem) {
                        case "BLOCKED":
                            showBox('error-blocked');
                            reject("BLOCKED");
                            return;
                        case "NOMEMBER":
                            noMember = true;
                            showBox('error-proxy');
                            reject("NOPROXY");
                            return;
                    }
                    if (xhr.status == 200) {
                        log(xhr.status + " " + xhr.statusText);
                        log("Request seems to have been intercepted:");
                        log(xhr.getAllResponseHeaders());
                        showUnknown();
                        reject("INTERCEPTED");
                        return;
                    } else {
                        showUnknown();
                        reject("AUTHREQUIRED");
                        return;
                    }
                case 204:
                    log("Request successful.")
                    resolve("OK");
                    return;
                default:
                    if (xhr.status === 0 && xhr.statusText == "") {
                        log("Request was blocked by the browser!")
                    } else {
                        log(xhr.status + " " + xhr.statusText);
                        let problem = xhr.getResponseHeader('x-ssn-problem');
                        log("X-SSN-Problem: " + problem);
                    }

                    showUnknown();
                    reject("FAIL");
                    return;
            }
        }).catch(function(err) {
            showUnknown();
            reject(err);
        });
    });
}

function ice() {
    return new Promise(function(resolve, reject) {
        const config = {
            iceServers: [{
                url: iceServer,
                urls: [iceServer],
                username: "",
                credential: ""
            }],
            iceTransportPolicy: "all",
            iceCandidatePoolSize: 0,
            sdpSemantics: 'unified-plan'
        };

        let best = null;
        let pc = new RTCPeerConnection(config);
        pc.onicecandidate = function(event) {
            if (event.candidate) {
                const text = event.candidate.candidate;
                const prefix = 'candidate:';
                const pos = text.indexOf(prefix) + prefix.length;
                const fields = text.substr(pos).split(' ');
                fields[2] = fields[2].toLowerCase(); // UDP -> udp

                log(text);

                if (fields[1] !== "1" || fields[2] !== "udp") {
                    return;
                }

                if (best === null || best.priority >= fields[3]) {
                    best = {
                        'priority': fields[3],
                        'protocol': fields[2],
                        'address': fields[4],
                        'port': parseInt(fields[5]),
                        'type': fields[7]
                    };
                }
            } else if (!('onicegatheringstatechange' in RTCPeerConnection.prototype)) {
                pc.close();
                pc = null;
                resolve(best);
            }
        };
        pc.onicegatheringstatechange = function(event) {
            if (pc.iceGatheringState !== 'complete') {
                return;
            }
            pc.close();
            pc = null;
            resolve(best);
        };
        if ('addTransceiver' in RTCPeerConnection.prototype) {
            pc.addTransceiver('audio');
        }
        pc.createOffer({offerToReceiveAudio: true}).then(
        function(desc) {
            pc.setLocalDescription(desc);
        },
        function(error) {
            reject(error);
        });
        window.setTimeout(function() {
            if (!!pc) {
                pc.close();
                pc = null;
            }
            reject('TIMEOUT');
        }, timeout);
    });
}

function checkNAT() {
    return new Promise(function(resolve, reject) {
        log("Performing WebRTC NAT test by contacting " + iceServer + " ...");
        ice().then(function(candidate) {
            if (candidate === null) {
                log("ICE failed. WebRTC might be disabled or not supported.");
                if (noMember) {
                    showBox('warn-nat');
                } else {
                    showUnknown();
                }
                reject('FAIL')
            } else {
                log("Detected External IP: " + candidate.address);
                if (candidate.address.indexOf('141.84.69.') < 0 && candidate.address.indexOf('129.187.166.15') < 0) {
                    log("Detected External IP is not a SSN IP.");
                    showUnknown();
                    reject('LOCALIP');
                } else {
                    resolve(candidate.address+':'+candidate.port);
                }
            }
        }).catch(function(error) {
            log("Error: " + error);
            if (noMember) {
                showBox('warn-nat');
            } else {
                showUnknown();
            }
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
    const status = getStatusColumn(index);
    return new Promise(function(resolve, reject) {
        markRunning(status);
        log("----------");
        sleep(500).then(function(res) {
            testFunc().then(function(res) {
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

const logElem = document.getElementById('log');
logElem.onclick = function() {
    this.focus();
    this.select();
}

function log(msg) {
    logElem.innerHTML += msg + "\n";
}

function showBox(name) {
    document.getElementById(name).classList.add('show');
}

function showUnknown() {
    showBox('error-unknown');
    showLog();
}

function showLog() {
    document.getElementById('log-container').classList.add('show');
    logElem.style.height = (logElem.scrollHeight+2) + 'px';
}

function showLogButton() {
    if (document.getElementById('log-container').className == "") {
        let btnContainer = document.querySelector('#log-show');
        btnContainer.classList.add('show');
        document.querySelector('#log-show button').onclick = function () {
            btnContainer.className = "";
            showLog();
        }
    }
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
    log("===== StuStaNet Connectivity Selftest =====");
    log("Date: " + Date().toString());
    log("User Agent: " + window.navigator.userAgent);

    if (isIncompatibleBrowser()) {
        showBox('error-browser');
        skipRemainingTests(-1);
        return Promise.reject('UNSUPPORTED');
    }

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
        return checkNAT();
    });
}).then(function(res) {
    log("----------");
    log("No problems detected.");
    showLogButton();
    document.getElementById('status').innerHTML = "Done! No problems detected."
}).catch(function(err) {
    log("----------");
    log("Test failed.");
    showLogButton();
    document.getElementById('status').innerHTML = "Problems detected!"
});
