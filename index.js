const tls = require('tls');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

// --- INDEPENDENT ARGUMENT PARSER ---
const argsList = process.argv.slice(2);
function getFlagValue(flags, defaultValue) {
    for (let i = 0; i < argsList.length; i++) {
        if (flags.includes(argsList[i]) && argsList[i + 1]) {
            return argsList[i + 1];
        }
    }
    return defaultValue;
}

// 1. Resolve Mode first
const MODE = getFlagValue(['-s', '--mode'], 'shell').toLowerCase(); 

// 2. Resolve Paths based on Mode Defaults
const defaultCert = (MODE === 'db') ? 'server.crt' : 'client.crt';
const defaultKey = (MODE === 'db') ? 'server.key' : 'client.key';

// 3. Apply overrides from command line
const CA_FILE   = getFlagValue(['-ca', '--ca-cert'], 'ca.crt');
const CERT_FILE = getFlagValue(['-c', '--cert'], defaultCert);
const KEY_FILE  = getFlagValue(['-k', '--key', '--keys'], defaultKey);

const PORT = parseInt(getFlagValue(['-p', '--port'], '9999'), 10);
const HOST = getFlagValue(['-ip', '-h', '--host'], MODE === 'db' ? '0.0.0.0' : 'localhost');

// --- PRE-FLIGHT SECURITY CHECK ---
const checkPath = (label, p) => {
    const absolutePath = path.resolve(process.cwd(), p);
    if (!fs.existsSync(absolutePath)) {
        console.error(`\x1b[31m[ERROR]\x1b[0m ${label} not found at: ${absolutePath}`);
        return false;
    }
    return true;
};

const ok = checkPath("CA Cert", CA_FILE) && checkPath("Cert", CERT_FILE) && checkPath("Key", KEY_FILE);

if (!ok) {
    console.error("\n\x1b[33mUsage Tip:\x1b[0m node tlite.js --cert ./path/to/cert.crt --key ./path/to/key.key");
    process.exit(1);
}

// --- SERVER (DB) MODE ---
if (MODE === 'db') {
    // Resolved Database Path with -df alias
    const DB_PATH = getFlagValue(['-df', '--dump-file'], null) || getFlagValue(['-l', '--load'], path.join(__dirname, 'data.sqlite'));
    const LOG_PREFIX = getFlagValue(['-lp', '--log-prefix'], DB_PATH);
    const LOG_PATH = LOG_PREFIX + ".log";
    const DT_RAW = getFlagValue(['-dt'], '60s');

    // Enhanced Logging Utility: [Timestamp] [IP:PORT] [Category] [Command] [Status] "Details"
    const logger = (socket, event, cmd, status, message) => {
        const timestamp = new Date().toISOString();
        const ip = socket ? socket.remoteAddress : "127.0.0.1";
        const port = socket ? socket.remotePort : "0000";
        const clientInfo = `${ip}:${port}`;
        
        const cleanMsg = String(message).replace(/"/g, "'").replace(/\n/g, " ");
        const logEntry = `[${timestamp}] [${clientInfo}] [${event.toUpperCase()}] [${cmd.toUpperCase()}] [${status}] "${cleanMsg}"\n`;
        
        try {
            fs.appendFileSync(LOG_PATH, logEntry);
        } catch (e) {
            console.error(`[CRITICAL] Logger Fail: ${e.message}`);
        }
        console.log(logEntry.trim());
    };

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

    let globalLock = false;
    const commandQueue = [];

    function processQueue() {
        if (globalLock || commandQueue.length === 0) return;
        const task = commandQueue.shift();
        executeCommand(task.cmd, task.args, task.socket);
    }

    // Initialize SQLite in-memory
    const memDb = new sqlite3.Database(':memory:');
    let currentTable = 'store';

    memDb.serialize(() => {
        memDb.run(`CREATE TABLE IF NOT EXISTS ${currentTable} (key TEXT PRIMARY KEY, value TEXT)`);
        if (fs.existsSync(DB_PATH)) {
            memDb.run(`ATTACH DATABASE '${DB_PATH}' AS disk`, (err) => {
                if (!err) {
                    memDb.all("SELECT name FROM disk.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (e, tables) => {
                        if (!e) {
                            tables.forEach(t => {
                                memDb.run(`CREATE TABLE IF NOT EXISTS main.${t.name} (key TEXT PRIMARY KEY, value TEXT)`);
                                memDb.run(`INSERT OR IGNORE INTO main.${t.name} SELECT * FROM disk.${t.name}`);
                            });
                        }
                        memDb.run(`DETACH DATABASE disk`, () => {
                            logger(null, "SYSTEM", "BOOT_SYNC", "SUCCESS", `Memory loaded from ${path.basename(DB_PATH)}`);
                        });
                    });
                } else {
                    logger(null, "SYSTEM", "BOOT_SYNC", "ERROR", err.message);
                }
            });
        }
    });

    const persistToDisk = (targetPath = DB_PATH, socket = null, cmd = 'auto-sync', callback = null) => {
        if (fs.existsSync(targetPath)) { try { fs.unlinkSync(targetPath); } catch(e) {} }
        memDb.run(`VACUUM INTO '${targetPath}'`, (err) => {
            const status = err ? "ERROR" : "SUCCESS";
            const msg = err ? err.message : `Dumped to ${path.basename(targetPath)}`;
            logger(socket, "SYNC", cmd, status, msg);
            if (socket) sendJson(socket, { status, command: cmd, message: msg });
            if (callback) callback(err);
        });
    };

    setInterval(() => persistToDisk(), parseDuration(DT_RAW) * 1000);

    const server = tls.createServer({
        key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE), ca: fs.readFileSync(CA_FILE),
        requestCert: true, rejectUnauthorized: true
    }, (socket) => {
        logger(socket, "NETWORK", "TLS_CONNECT", "INFO", "Handshake successful");
        socket.cursor = { results: [], limit: 0, index: 0, total: 0 };
        socket.on('data', (data) => {
            try {
                const req = JSON.parse(data.toString());
                commandQueue.push({ cmd: req.cmd, args: req.args || {}, socket });
                processQueue();
            } catch (e) { 
                logger(socket, "NETWORK", "JSON_PARSE", "ERROR", "Malformed payload");
                sendJson(socket, { status: "error", message: "Malformed JSON" }); 
            }
        });
        socket.on('end', () => logger(socket, "NETWORK", "DISCONNECT", "INFO", "Connection closed"));
        socket.on('error', (err) => logger(socket, "NETWORK", "SOCKET_ERR", "ERROR", err.message));
    });

    function sendJson(socket, obj) {
        if (socket && !socket.destroyed && socket.writable) socket.write(JSON.stringify(obj) + '\n');
    }

    function executeCommand(cmd, args, socket) {
        const command = cmd ? cmd.toLowerCase() : '';
        const writeCmds = ['set', 'delete', 'clear', 'init', 'load', 'sql'];
        if (writeCmds.includes(command)) globalLock = true;

        const finalize = (err, result) => {
            const status = err ? "ERROR" : "SUCCESS";
            let context = `Table: ${currentTable}`;
            if (args.k) context += ` | Key: ${args.k}`;
            if (args.sql) context += ` | Query: ${args.sql.substring(0, 50)}...`;

            logger(socket, "COMMAND", command, status, context);

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
            case 'tables': memDb.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, rows) => finalize(err, rows)); break;
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
            case 'dump': persistToDisk(DB_PATH, socket, 'dump'); finalize(null, "Manual sync triggered"); break;
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

    const handleShutdown = (type) => {
        logger(null, "SYSTEM", "SHUTDOWN", "INFO", `Signal: ${type}. Preserving memory state...`);
        persistToDisk(DB_PATH, null, 'shutdown-sync', (err) => {
            if (err) logger(null, "SYSTEM", "SHUTDOWN", "ERROR", err.message);
            else logger(null, "SYSTEM", "SHUTDOWN", "SUCCESS", "Memory persisted to disk.");
            process.exit(err ? 1 : 0);
        });
        setTimeout(() => process.exit(1), 5000);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
        logger(null, "SYSTEM", "CRASH", "FATAL", err.stack);
        handleShutdown('CRASH');
    });

    server.listen(PORT, HOST, () => {
        logger(null, "SYSTEM", "STARTUP", "SUCCESS", `Active on ${HOST}:${PORT}. DB: ${path.resolve(DB_PATH)}`);
    });

} else if (MODE === 'shell') {
    // --- SHELL (CLIENT) MODE ---
    let cursorActive = false, pendingCommand = null;
    const client = tls.connect(PORT, HOST, {
        key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE), ca: fs.readFileSync(CA_FILE),
        rejectUnauthorized: true
    });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const getPrompt = () => `${os.userInfo().username}@${HOST}:${PORT}> `;

    const closeShell = () => {
        rl.close();
        client.destroy();
        process.exit(0);
    };

    client.on('connect', () => { 
        console.log(JSON.stringify({ event: "connected", mode: "shell", host: HOST, port: PORT })); 
        rl.setPrompt(getPrompt()); rl.prompt(); 
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
        rl.setPrompt(getPrompt()); rl.prompt();
    });

    rl.on('line', (line) => {
        const input = line.trim().toLowerCase();
        if (input === 'exit' || input === 'quit') return closeShell();

        if (pendingCommand) {
            if (input === 'y' || input === 'yes') client.write(pendingCommand);
            else console.log("Aborted.");
            pendingCommand = null; rl.setPrompt(getPrompt()); rl.prompt(); return;
        }

        if (!input && cursorActive) return client.write(JSON.stringify({ cmd: "next" }));
        if (!input) return rl.prompt();

        const parts = line.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const findInShell = (f) => { const idx = parts.indexOf(f); return idx !== -1 ? parts[idx + 1] : null; };
        const cmdData = (line.match(/-cmd\s+`([^`]+)`/) || [])[1];

        const payload = JSON.stringify({
            cmd, args: {
                k: parts[1], v: parts[2], q: parts[1], f: findInShell('-f'),
                n: findInShell('-n'), sql: cmd === 'sql' ? cmdData : null, 
                data: cmd === 'init' ? cmdData : null
            }
        });

        if (cmd === 'clear' || cmd === 'init') {
            pendingCommand = payload;
            rl.setPrompt(`\x1b[31m[DANGER]\x1b[0m Confirm ${cmd}? (y/N): `); rl.prompt();
        } else client.write(payload);
    });

    rl.on('SIGINT', () => closeShell());
    client.on('error', (err) => { console.error("Connection Error:", err.message); process.exit(1); });
}