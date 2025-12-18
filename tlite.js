const tls = require('tls');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// --- UTILITIES ---
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

const argsList = process.argv.slice(2);
const getArg = (flags, defaultValue) => {
    for (let i = 0; i < argsList.length; i++) {
        if (flags.includes(argsList[i]) && argsList[i + 1]) return argsList[i + 1];
    }
    return defaultValue;
};

const config = {
    ip: getArg(['-ip', '-h', '--host'], '0.0.0.0'),
    port: parseInt(getArg(['-p', '--port'], '9999'), 10),
    ca: getArg(['-ca'], 'ca.crt'),
    cert: getArg(['-c'], 'server.crt'),
    key: getArg(['-k'], 'server.key'),
    dtRaw: getArg(['-dt'], '60s'),
    dbPath: getArg(['--dump-file'], null) || getArg(['-l', '--load'], path.join(__dirname, 'data.sqlite'))
};

// --- DYNAMIC TRANSACTION LOCKING ---
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
    if (fs.existsSync(config.dbPath)) {
        memDb.run(`ATTACH DATABASE '${config.dbPath}' AS disk`, (err) => {
            if (!err) {
                memDb.run(`INSERT OR IGNORE INTO main.${currentTable} SELECT * FROM disk.${currentTable}`, () => {
                    memDb.run(`DETACH DATABASE disk`, () => {
                        console.log(`[*] Data loaded. Disk file '${path.basename(config.dbPath)}' is UNLOCKED.`);
                    });
                });
            }
        });
    }
});

const persistToDisk = (targetPath = config.dbPath, socket = null, cmd = 'auto-sync') => {
    if (fs.existsSync(targetPath)) { try { fs.unlinkSync(targetPath); } catch(e) {} }
    memDb.run(`VACUUM INTO '${targetPath}'`, (err) => {
        if (socket) sendJson(socket, { status: err ? "error" : "success", command: cmd, message: err ? err.message : `Persisted to disk.` });
    });
};

setInterval(persistToDisk, parseDuration(config.dtRaw) * 1000);

const server = tls.createServer({
    key: fs.readFileSync(config.key), cert: fs.readFileSync(config.cert), ca: fs.readFileSync(config.ca),
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
    const writeCommands = ['set', 'delete', 'clear', 'init', 'load', 'sql'];

    if (writeCommands.includes(command)) globalLock = true;

    const finalize = (err, result) => {
        if (err) {
            sendJson(socket, { status: "error", command, message: err.message });
        } else if ((command === 'get' || command === 'delete') && result === undefined) {
            // Improved logic for missing keys
            sendJson(socket, { status: "error", command, message: "Key not found" });
        } else {
            // If result is null/undefined for search/list, return empty array instead of "OK"
            const output = (result === undefined || result === null) ? [] : result;
            sendJson(socket, { status: "success", command, data: output });
        }
        globalLock = false;
        processQueue();
    };

    if (command === 'next' && socket.cursor.results.length > 0) return sendCursorBatch(socket, finalize);

    const q = `%${args.q}%`;
    switch (command) {
        case 'set': memDb.run(`INSERT OR REPLACE INTO ${currentTable} (key, value) VALUES (?, ?)`, [args.k, args.v], (err) => finalize(err, "OK")); break;
        case 'get': memDb.get(`SELECT value FROM ${currentTable} WHERE key = ?`, [args.k], finalize); break;
        case 'delete': 
            // Check if exists before deleting to provide meaningful error
            memDb.get(`SELECT key FROM ${currentTable} WHERE key = ?`, [args.k], (err, row) => {
                if (!row) return finalize(null, undefined);
                memDb.run(`DELETE FROM ${currentTable} WHERE key = ?`, [args.k], (err2) => finalize(err2, "Deleted"));
            });
            break;
        case 'clear': memDb.run(`DELETE FROM ${currentTable}`, (err) => finalize(err, "Store cleared")); break;
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
            if (args.f && args.f.endsWith('.json')) {
                const jData = JSON.parse(fs.readFileSync(args.f));
                memDb.serialize(() => {
                    const stmt = memDb.prepare(`INSERT OR REPLACE INTO ${currentTable} (key, value) VALUES (?, ?)`);
                    for (const [k, v] of Object.entries(jData)) stmt.run(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
                    stmt.finalize(() => finalize(null, "Loaded"));
                });
            } else { finalize(new Error("File error")); }
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
        case 'dump': persistToDisk(config.dbPath, socket, 'dump'); finalize(null, "Sync started"); break;
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
server.listen(config.port, config.ip, () => console.log(`[READY] Server on ${config.ip}:${config.port}`));