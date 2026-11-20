const axios = require('axios');

if (process.argv.length < 3) {
    console.log("node Cekici.js <Hedef> !");
    process.exit(-1);
}

const target = process.argv[2];
const flaresolverrUrl = 'http://localhost:8191/v1';

(async () => {
    try {
        const response = await axios.post(flaresolverrUrl, {
            cmd: "request.get",
            url: target,
            maxTimeout: 60000
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        const data = response.data;

        if (data && data.solution && data.solution.response) {
            console.log('OK !')
        } else {
            console.log('OK !')
        }
    } catch (Err) {
        console.error("Hata !");
    }
})();
