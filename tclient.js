const tls = require('tls');
const fs = require('fs');
const readline = require('readline');
const os = require('os');

const argsList = process.argv.slice(2);
const getArg = (flags, defaultValue) => {
    for (let i = 0; i < argsList.length; i++) {
        if (flags.includes(argsList[i]) && argsList[i + 1]) return argsList[i + 1];
    }
    return defaultValue;
};

const config = {
    ip: getArg(['-ip', '-h', '--host'], 'localhost'),
    port: parseInt(getArg(['-p', '--port'], '9999'), 10),
    ca: fs.readFileSync(getArg(['-ca'], 'ca.crt')),
    cert: fs.readFileSync(getArg(['-c'], 'client.crt')),
    key: fs.readFileSync(getArg(['-k'], 'client.key'))
};

let cursorActive = false;
let pendingCommand = null;

const client = tls.connect(config.port, config.ip, {
    key: config.key, cert: config.cert, ca: config.ca, rejectUnauthorized: true
});

const getPrompt = () => `${os.userInfo().username}@${config.ip}:${config.port}> `;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

client.on('connect', () => { 
    console.log(JSON.stringify({ event: "connected", host: config.ip })); 
    rl.setPrompt(getPrompt());
    rl.prompt(); 
});

client.on('data', (data) => {
    data.toString().trim().split('\n').forEach(line => {
        if (!line) return;
        try {
            const res = JSON.parse(line);
            console.log(JSON.stringify(res, null, 2));
            cursorActive = res.pagination ? res.pagination.hasMore : false;
        } catch (e) { console.log("Raw Response:", line); }
    });
    rl.setPrompt(getPrompt());
    rl.prompt();
});

rl.on('line', (line) => {
    const input = line.trim();
    if (pendingCommand) {
        if (input.toLowerCase() === 'y' || input.toLowerCase() === 'yes') {
            client.write(pendingCommand);
        } else {
            console.log("Operation Cancelled.");
        }
        pendingCommand = null;
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
    }

    if (!input && cursorActive) return client.write(JSON.stringify({ cmd: "next" }));
    if (!input) return rl.prompt();
    if (input === 'exit' || input === 'quit') return client.end();

    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const findInShell = (flag) => {
        const idx = parts.indexOf(flag);
        return idx !== -1 ? parts[idx + 1] : null;
    };

    let cmdData = findInShell('-cmd') || (input.match(/-cmd\s+`([^`]+)`/) || [])[1];

    const payload = JSON.stringify({
        cmd,
        args: {
            k: parts[1], v: parts[2], q: parts[1],
            f: findInShell('-f'), ck: findInShell('-ck'), cv: findInShell('-cv'),
            t: findInShell('-t'), n: findInShell('-n'),
            sql: cmd === 'sql' ? cmdData : null,
            data: cmd === 'init' ? cmdData : null
        }
    });

    if (cmd === 'clear' || cmd === 'init') {
        pendingCommand = payload;
        rl.setPrompt(`\x1b[31m[DANGER]\x1b[0m Confirmed ${cmd}? (y/N): `);
        rl.prompt();
    } else {
        client.write(payload);
    }
});

client.on('error', (err) => { 
    console.error(JSON.stringify({ event: "error", message: err.message })); 
    process.exit(1); 
});