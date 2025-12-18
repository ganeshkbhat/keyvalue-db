const tls = require('tls');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

// --- ARGUMENT PARSING ---
const argsList = process.argv.slice(2);
const getArg = (flags, defaultValue) => {
    for (let i = 0; i < argsList.length; i++) {
        if (flags.includes(argsList[i]) && argsList[i + 1]) return argsList[i + 1];
    }
    return defaultValue;
};

const MODE = getArg(['-s', '--mode'], 'db').toLowerCase(); // 'db' or 'shell'
const PORT = parseInt(getArg(['-p', '--port'], '9999'), 10);
const HOST = getArg(['-ip', '-h', '--host'], MODE === 'db' ? '0.0.0.0' : 'localhost');
const CA_FILE = getArg(['-ca'], 'ca.crt');
const CERT_FILE = getArg(['-c'], 'server.crt'); // Uses client.crt in shell mode below
const KEY_FILE = getArg(['-k'], 'server.key');   // Uses client.key in shell mode below

// --- SERVER (DB) MODE ---
if (MODE === 'db') {
    function parseDuration(str) {
        const regex = /(-?\d+)([hms])/g;
        let totalSeconds = 0, match, found = false;
        while ((match = regex.exec(str)) !== null) {
            found = true;
            const value = parseInt(match[1], 10);
            const unit = match[2];
            if (unit === 'h') totalSeconds += value * 3600;
            if (unit === 'm') totalSeconds += value * 60;
            if (unit === 's') totalSeconds += value;
        }
        return found ? totalSeconds : (parseInt(str, 10) || 60);
    }

    const DB_PATH = getArg(['--dump-file'], null) || getArg(['-l', '--load'], path.join(__dirname, 'data.sqlite'));
    const DT_RAW = getArg(['-dt'], '60s');

    let globalLock = false;
    const commandQueue = [];

    function processQueue() {
        if (globalLock || commandQueue.length === 0) return;
        const task = commandQueue.shift();
        executeCommand(task.cmd, task.args, task.socket);
    }

    const memDb = new sqlite3.Database(':memory:');
    let currentTable = 'store';

    memDb.serialize(() => {
        memDb.run(`CREATE TABLE IF NOT EXISTS ${currentTable} (key TEXT PRIMARY KEY, value TEXT)`);
        if (fs.existsSync(DB_PATH)) {
            memDb.run(`ATTACH DATABASE '${DB_PATH}' AS disk`, (err) => {
                if (!err) {
                    memDb.run(`INSERT OR IGNORE INTO main.${currentTable} SELECT * FROM disk.${currentTable}`, () => {
                        memDb.run(`DETACH DATABASE disk`, () => {
                            console.log(`[*] Data loaded. Disk file UNLOCKED.`);
                        });
                    });
                }
            });
        }
    });

    const persistToDisk = (targetPath = DB_PATH, socket = null, cmd = 'auto-sync') => {
        if (fs.existsSync(targetPath)) { try { fs.unlinkSync(targetPath); } catch(e) {} }
        memDb.run(`VACUUM INTO '${targetPath}'`, (err) => {
            if (socket) sendJson(socket, { status: err ? "error" : "success", command: cmd, message: err ? err.message : `Persisted.` });
        });
    };

    setInterval(persistToDisk, parseDuration(DT_RAW) * 1000);

    const server = tls.createServer({
        key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE), ca: fs.readFileSync(CA_FILE),
        requestCert: true, rejectUnauthorized: true
    }, (socket) => {
        socket.cursor = { results: [], limit: 0, index: 0, total: 0 };
        socket.on('data', (data) => {
            try {
                const req = JSON.parse(data.toString());
                commandQueue.push({ cmd: req.cmd, args: req.args || {}, socket });
                processQueue();
            } catch (e) { sendJson(socket, { status: "error", message: "Malformed JSON" }); }
        });
        socket.on('error', () => {});
    });

    function sendJson(socket, obj) {
        if (socket && !socket.destroyed && socket.writable) socket.write(JSON.stringify(obj) + '\n');
    }

    function executeCommand(cmd, args, socket) {
        const command = cmd ? cmd.toLowerCase() : '';
        const writeCmds = ['set', 'delete', 'clear', 'init', 'load', 'sql'];
        if (writeCmds.includes(command)) globalLock = true;

        const finalize = (err, result) => {
            if (err) sendJson(socket, { status: "error", command, message: err.message });
            else if ((command === 'get' || command === 'delete') && result === undefined) {
                sendJson(socket, { status: "error", command, message: "Key not found" });
            } else {
                sendJson(socket, { status: "success", command, data: (result === undefined || result === null) ? [] : result });
            }
            globalLock = false; processQueue();
        };

        if (command === 'next' && socket.cursor.results.length > 0) return sendCursorBatch(socket, finalize);

        const q = `%${args.q}%`;
        switch (command) {
            case 'set': memDb.run(`INSERT OR REPLACE INTO ${currentTable} (key, value) VALUES (?, ?)`, [args.k, args.v], (err) => finalize(err, "OK")); break;
            case 'get': memDb.get(`SELECT value FROM ${currentTable} WHERE key = ?`, [args.k], finalize); break;
            case 'delete': 
                memDb.get(`SELECT key FROM ${currentTable} WHERE key = ?`, [args.k], (err, row) => {
                    if (!row) return finalize(null, undefined);
                    memDb.run(`DELETE FROM ${currentTable} WHERE key = ?`, [args.k], (e2) => finalize(e2, "Deleted"));
                });
                break;
            case 'clear': memDb.run(`DELETE FROM ${currentTable}`, (err) => finalize(err, "Cleared")); break;
            case 'use':
                const target = (args.k || 'store').replace(/[^a-z0-9_]/gi, '');
                memDb.run(`CREATE TABLE IF NOT EXISTS ${target} (key TEXT PRIMARY KEY, value TEXT)`, (err) => {
                    if (!err) currentTable = target;
                    finalize(err, `Switched to ${target}`);
                });
                break;
            case 'search': memDb.all(`SELECT * FROM ${currentTable} WHERE key LIKE ? OR value LIKE ?`, [q, q], finalize); break;
            case 'searchkey': memDb.all(`SELECT * FROM ${currentTable} WHERE key LIKE ?`, [q], finalize); break;
            case 'searchvalue': memDb.all(`SELECT * FROM ${currentTable} WHERE value LIKE ?`, [q], finalize); break;
            case 'init':
                try {
                    let data = args.f && fs.existsSync(args.f) ? JSON.parse(fs.readFileSync(args.f)) : (args.data ? JSON.parse(args.data) : null);
                    memDb.serialize(() => {
                        memDb.run(`DELETE FROM ${currentTable}`);
                        const stmt = memDb.prepare(`INSERT INTO ${currentTable} (key, value) VALUES (?, ?)`);
                        for (const [k, v] of Object.entries(data)) stmt.run(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
                        stmt.finalize(() => finalize(null, "Initialized"));
                    });
                } catch(e) { finalize(e); }
                break;
            case 'load':
                if (args.f && fs.existsSync(args.f)) {
                    const jData = JSON.parse(fs.readFileSync(args.f));
                    memDb.serialize(() => {
                        const stmt = memDb.prepare(`INSERT OR REPLACE INTO ${currentTable} (key, value) VALUES (?, ?)`);
                        for (const [k, v] of Object.entries(jData)) stmt.run(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
                        stmt.finalize(() => finalize(null, "Loaded"));
                    });
                } else finalize(new Error("File error"));
                break;
            case 'list':
                memDb.all(`SELECT * FROM ${currentTable}`, (err, rows) => {
                    if (args.n && !err) {
                        socket.cursor = { results: rows, limit: parseInt(args.n), index: 0, total: rows.length };
                        return sendCursorBatch(socket, finalize);
                    }
                    finalize(err, rows);
                });
                break;
            case 'dump': persistToDisk(DB_PATH, socket, 'dump'); finalize(null, "Syncing..."); break;
            case 'sql': memDb.all(args.sql, [], finalize); break;
            default: globalLock = false; finalize(new Error("Unknown"));
        }
    }

    function sendCursorBatch(socket, finalize) {
        const { results, limit, index, total } = socket.cursor;
        const batch = results.slice(index, index + limit);
        socket.cursor.index += batch.length;
        const hasMore = socket.cursor.index < total;
        sendJson(socket, { status: "success", command: "list", data: batch, pagination: { progress: `${socket.cursor.index}/${total}`, hasMore } });
        if (!hasMore) socket.cursor = { results: [], limit: 0, index: 0, total: 0 };
        globalLock = false; processQueue();
    }

    process.on('SIGINT', () => { persistToDisk(); setTimeout(() => process.exit(0), 1000); });
    server.listen(PORT, HOST, () => console.log(`[DB MODE] Listening on ${HOST}:${PORT}`));

} else if (MODE === 'shell') {
    // --- SHELL (CLIENT) MODE ---
    const clientCert = getArg(['-c'], 'client.crt');
    const clientKey = getArg(['-k'], 'client.key');

    let cursorActive = false, pendingCommand = null;
    const client = tls.connect(PORT, HOST, {
        key: fs.readFileSync(clientKey), cert: fs.readFileSync(clientCert), ca: fs.readFileSync(CA_FILE),
        rejectUnauthorized: true
    });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const getPrompt = () => `${os.userInfo().username}@${HOST}:${PORT}> `;

    client.on('connect', () => { 
        console.log(JSON.stringify({ event: "connected", host: HOST })); 
        rl.setPrompt(getPrompt()); rl.prompt(); 
    });

    client.on('data', (data) => {
        data.toString().trim().split('\n').forEach(line => {
            if (!line) return;
            try {
                const res = JSON.parse(line);
                console.log(JSON.stringify(res, null, 2));
                cursorActive = res.pagination ? res.pagination.hasMore : false;
            } catch (e) { console.log("Raw:", line); }
        });
        rl.setPrompt(getPrompt()); rl.prompt();
    });

    rl.on('line', (line) => {
        const input = line.trim();
        if (pendingCommand) {
            if (input.toLowerCase() === 'y' || input.toLowerCase() === 'yes') client.write(pendingCommand);
            pendingCommand = null; rl.setPrompt(getPrompt()); rl.prompt(); return;
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
        const cmdData = findInShell('-cmd') || (input.match(/-cmd\s+`([^`]+)`/) || [])[1];

        const payload = JSON.stringify({
            cmd, args: {
                k: parts[1], v: parts[2], q: parts[1], f: findInShell('-f'),
                n: findInShell('-n'), sql: cmd === 'sql' ? cmdData : null, data: cmd === 'init' ? cmdData : null
            }
        });

        if (cmd === 'clear' || cmd === 'init') {
            pendingCommand = payload;
            rl.setPrompt(`\x1b[31m[DANGER]\x1b[0m Confirm ${cmd}? (y/N): `); rl.prompt();
        } else client.write(payload);
    });

    client.on('error', (err) => { console.error("Error:", err.message); process.exit(1); });
}