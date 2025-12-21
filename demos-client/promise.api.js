var tls = require('tls');
var fs = require('fs');
var ClientPromiseAPI = require("../clients/api.js").ClientPromiseAPI;

// --- CONFIGURATION ---
var config = {
    host: 'localhost',
    port: 9999,
    ca: './certs/ca.crt',
    cert: './certs/client.crt',
    key: './certs/client.key'
};


async function run() {
    try {
        var db = await ClientPromiseAPI(config);
        
        await db.use('logs');
        await db.set('entry_1', 'Server Start');
        
        var res = await db.get('entry_1');
        console.log(res.data.value);

        console.log(await db.use('store'));
        console.log(await db.set('entry', "newvalue"));
        res = await db.get("entry")
        console.log(res);
        db.close();
    } catch (e) {
        console.error(e);
    }
}
run();

