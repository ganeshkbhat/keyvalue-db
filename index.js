const tls = require('tls');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { DatabaseSync } = require('node:sqlite');

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
const defaultCert = path.join('certs', MODE === 'db' ? 'server.crt' : 'client.crt');
const defaultKey = path.join('certs', MODE === 'db' ? 'server.key' : 'client.key');

// 3. Apply overrides from command line
const CA_FILE   = getFlagValue(['-ca', '--ca-cert'], path.join('certs', 'ca.crt'));
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
    process.exit(1);
}

// --- SERVER (DB) MODE ---
if (MODE === 'db') {
    const DB_PATH = getFlagValue(['-df', '--dump-file'], null) || getFlagValue(['-l', '--load'], path.join(__dirname, 'data.sqlite'));
    const LOG_PREFIX = getFlagValue(['-lp', '--log-prefix'], DB_PATH);
    const LOG_PATH = LOG_PREFIX + ".log";
    const DT_RAW = getFlagValue(['-dt'], '60s');

    const logger = (socket, event, cmd, status, message) => {
        const timestamp = new Date().toISOString();
        const ip = socket ? (socket.remoteAddress || "127.0.0.1") : HOST;
        const port = socket ? (socket.remotePort || PORT) : PORT;
        const clientInfo = `${ip}:${port}`;
        const cleanMsg = String(message).replace(/"/g, "'").replace(/\n/g, " ");
        const logEntry = `[${timestamp}] [${clientInfo}] [${event.toUpperCase()}] [${cmd.toUpperCase()}] [${status}] "${cleanMsg}"\n`;
        try { fs.appendFileSync(LOG_PATH, logEntry); } catch (e) {}
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
    let isShuttingDown = false;
    const commandQueue = [];

    function processQueue() {
        if (globalLock || commandQueue.length === 0 || isShuttingDown) return;
        const task = commandQueue.shift();
        executeCommand(task.cmd, task.args, task.socket);
    }

    const memDb = new DatabaseSync(':memory:');
    let currentDatabase = 'store';

    function initializeDatabaseSchemas(dbInstance) {
        dbInstance.exec(`CREATE TABLE IF NOT EXISTS store (key TEXT PRIMARY KEY, value TEXT)`);
        dbInstance.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'active')`);
        dbInstance.exec(`CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, description TEXT, status TEXT DEFAULT 'active', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
        dbInstance.exec(`CREATE TABLE IF NOT EXISTS user_groups (user_id INTEGER NOT NULL, group_id INTEGER NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, group_id))`);
        dbInstance.exec(`CREATE TABLE IF NOT EXISTS access_controls (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_table TEXT NOT NULL, resource_key TEXT NOT NULL, principal_type TEXT NOT NULL CHECK(principal_type IN ('user','group')), principal_id INTEGER NOT NULL, principal_name TEXT NOT NULL, can_read INTEGER DEFAULT 0, can_create INTEGER DEFAULT 0, can_update INTEGER DEFAULT 0, can_delete INTEGER DEFAULT 0, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
        dbInstance.exec(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, username TEXT NOT NULL, email TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'active')`);
        
        const adminCheck = dbInstance.prepare("SELECT 1 FROM users WHERE username = 'admin'").get();
        if (!adminCheck) {
            const hashedAdminPassword = bcrypt.hashSync('admin', 10);
            dbInstance.prepare("INSERT INTO users (username, email, password) VALUES ('admin', 'admin@admin.com', ?)").run(hashedAdminPassword);
        }
    }

    try {
        initializeDatabaseSchemas(memDb);
        
        if (!fs.existsSync(DB_PATH)) {
            try {
                const diskInitDb = new DatabaseSync(DB_PATH);
                initializeDatabaseSchemas(diskInitDb);
                diskInitDb.close();
                logger(null, "SYSTEM", "BOOT_INIT", "SUCCESS", `Created new empty database file at ${path.basename(DB_PATH)}`);
            } catch (e) {
                logger(null, "SYSTEM", "BOOT_INIT", "ERROR", `Could not create empty database file: ${e.message}`);
            }
        }

        if (fs.existsSync(DB_PATH)) {
            try {
                memDb.exec(`ATTACH DATABASE '${DB_PATH}' AS disk`);
                
                // Ensure structural system schemas are established on the attached disk if missing
                memDb.exec(`CREATE TABLE IF NOT EXISTS disk.store (key TEXT PRIMARY KEY, value TEXT)`);
                memDb.exec(`CREATE TABLE IF NOT EXISTS disk.users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'active')`);
                memDb.exec(`CREATE TABLE IF NOT EXISTS disk.groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, description TEXT, status TEXT DEFAULT 'active', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
                memDb.exec(`CREATE TABLE IF NOT EXISTS disk.user_groups (user_id INTEGER NOT NULL, group_id INTEGER NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, group_id))`);
                memDb.exec(`CREATE TABLE IF NOT EXISTS disk.access_controls (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_table TEXT NOT NULL, resource_key TEXT NOT NULL, principal_type TEXT NOT NULL CHECK(principal_type IN ('user','group')), principal_id INTEGER NOT NULL, principal_name TEXT NOT NULL, can_read INTEGER DEFAULT 0, can_create INTEGER DEFAULT 0, can_update INTEGER DEFAULT 0, can_delete INTEGER DEFAULT 0, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
                memDb.exec(`CREATE TABLE IF NOT EXISTS disk.sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, username TEXT NOT NULL, email TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'active')`);

                const tables = memDb.prepare("SELECT name FROM disk.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
                tables.forEach(t => {
                    if (t.name === 'users' || t.name === 'groups' || t.name === 'user_groups' || t.name === 'access_controls' || t.name === 'sessions') {
                        memDb.exec(`CREATE TABLE IF NOT EXISTS main.${t.name} (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, email TEXT UNIQUE, password TEXT, name TEXT UNIQUE, description TEXT, status TEXT, created TEXT, user_id INTEGER, group_id INTEGER, resource_table TEXT, resource_key TEXT, principal_type TEXT, principal_id INTEGER, principal_name TEXT, can_read INTEGER, can_create INTEGER, can_update INTEGER, can_delete INTEGER, token TEXT)`);
                    } else {
                        memDb.exec(`CREATE TABLE IF NOT EXISTS main.${t.name} (key TEXT PRIMARY KEY, value TEXT)`);
                    }
                    memDb.exec(`INSERT OR IGNORE INTO main.${t.name} SELECT * FROM disk.${t.name}`);
                });
                memDb.exec(`DETACH DATABASE disk`);
                logger(null, "SYSTEM", "BOOT_SYNC", "SUCCESS", `Loaded ${path.basename(DB_PATH)}`);
            } catch (e) {
                logger(null, "SYSTEM", "BOOT_SYNC", "ERROR", e.message);
            }
        }
    } catch (e) {
        logger(null, "SYSTEM", "BOOT_SYNC", "ERROR", e.message);
    }

    function getSession(args, socket) {
        const token = (args && args.session) || (socket && socket.auth && socket.auth.session);
        if (!token) return null;
        
        const row = memDb.prepare(`SELECT user_id AS userId, username, email, token AS session FROM sessions WHERE token = ? AND status = 'active'`).get(token);
        return row || null;
    }

    function requireSession(args, socket) {
        const session = getSession(args, socket);
        if (!session) throw new Error("Authentication required");
        return session;
    }

    function getUserGroups(userId) {
        return memDb.prepare("SELECT group_id FROM user_groups WHERE user_id = ?").all(userId).map(r => r.group_id);
    }

    function getUserGroupDetails(userId) {
        const groupIds = getUserGroups(userId);
        if (!groupIds.length) return [];
        return memDb.prepare(`SELECT id, name FROM groups WHERE id IN (${groupIds.map(() => '?').join(',')}) AND status = 'active'`).all(...groupIds);
    }

    function recordAutomaticCreatorPermissions(session, table, key) {
        memDb.prepare(`INSERT OR IGNORE INTO access_controls (resource_table, resource_key, principal_type, principal_id, principal_name, can_read, can_create, can_update, can_delete) VALUES (?, ?, 'user', ?, ?, 1, 1, 1, 1)`)
            .run(table, key, session.userId, session.username);
        
        const groupDetails = getUserGroupDetails(session.userId);
        groupDetails.forEach(group => {
            memDb.prepare(`INSERT OR IGNORE INTO access_controls (resource_table, resource_key, principal_type, principal_id, principal_name, can_read, can_create, can_update, can_delete) VALUES (?, ?, 'group', ?, ?, 1, 1, 1, 1)`)
                .run(table, key, group.id, group.name);
        });
    }

    function getAccessControls(userId, username, resourceTable, resourceKey) {
        const groupDetails = getUserGroupDetails(userId);
        let query = `SELECT principal_type, principal_id, principal_name, can_read, can_create, can_update, can_delete FROM access_controls WHERE resource_table = ? AND (resource_key = ? OR resource_key = '*') AND ((principal_type = 'user' AND principal_id = ? AND principal_name = ?)`;
        const params = [resourceTable, resourceKey, userId, username];
        
        if (groupDetails.length > 0) {
            const groupIds = groupDetails.map(g => g.id);
            const groupNames = groupDetails.map(g => g.name);
            query += ` OR (principal_type = 'group' AND principal_id IN (${groupIds.map(() => '?').join(',')}) AND principal_name IN (${groupNames.map(() => '?').join(',')}))`;
            params.push(...groupIds, ...groupNames);
        }
        query += `)`;
        return memDb.prepare(query).all(...params);
    }

    function getEffectivePermissions(userId, username, resourceTable, resourceKey) {
        const rows = getAccessControls(userId, username, resourceTable, resourceKey);
        return rows.reduce((perms, row) => ({
            read: perms.read || row.can_read,
            create: perms.create || row.can_create,
            update: perms.update || row.can_update,
            delete: perms.delete || row.can_delete
        }), { read: 0, create: 0, update: 0, delete: 0 });
    }

    function hasPermission(userId, username, resourceTable, resourceKey, action) {
        if (username === 'admin') return true;
        const effective = getEffectivePermissions(userId, username, resourceTable, resourceKey);
        return effective[action] === 1;
    }

    function ensurePermission(userId, username, resourceTable, resourceKey, action) {
        if (!hasPermission(userId, username, resourceTable, resourceKey, action)) {
            throw new Error(`Permission denied for ${action} on ${resourceTable}:${resourceKey}`);
        }
    }

    function getAuthorizedKeys(userId, username, resourceTable, action) {
        if (username === 'admin' || hasPermission(userId, username, resourceTable, '*', action)) return null;
        const column = action === 'read' ? 'can_read' : action === 'create' ? 'can_create' : action === 'update' ? 'can_update' : 'can_delete';
        const groupDetails = getUserGroupDetails(userId);
        let query = `SELECT DISTINCT resource_key FROM access_controls WHERE resource_table = ? AND resource_key != '*' AND ${column} = 1 AND ((principal_type = 'user' AND principal_id = ? AND principal_name = ?)`;
        const params = [resourceTable, userId, username];
        
        if (groupDetails.length > 0) {
            const groupIds = groupDetails.map(g => g.id);
            const groupNames = groupDetails.map(g => g.name);
            query += ` OR (principal_type = 'group' AND principal_id IN (${groupIds.map(() => '?').join(',')}) AND principal_name IN (${groupNames.map(() => '?').join(',')}))`;
            params.push(...groupIds, ...groupNames);
        }
        query += `)`;
        return memDb.prepare(query).all(...params).map(r => r.resource_key);
    }

    const persistToDisk = (targetPath = DB_PATH, socket = null, cmd = 'auto-sync') => {
        if (!memDb) return false;
        const tmpPath = targetPath + '.tmp';
        const uniqueAlias = 'ds_' + Math.random().toString(36).substring(2, 10);
        try {
            if (fs.existsSync(tmpPath)) { try { fs.unlinkSync(tmpPath); } catch(e) {} }
            
            memDb.exec(`ATTACH DATABASE '${tmpPath}' AS ${uniqueAlias}`);
            const memoryTables = memDb.prepare("SELECT name, sql FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
            
            memoryTables.forEach(t => {
                memDb.exec(`DROP TABLE IF EXISTS ${uniqueAlias}.${t.name}`);
                const createSql = t.sql
                    .replace(`CREATE TABLE ${t.name}`, `CREATE TABLE ${uniqueAlias}.${t.name}`)
                    .replace(`CREATE TABLE IF NOT EXISTS ${t.name}`, `CREATE TABLE IF NOT EXISTS ${uniqueAlias}.${t.name}`);
                memDb.exec(createSql);
                memDb.exec(`INSERT INTO ${uniqueAlias}.${t.name} SELECT * FROM main.${t.name}`);
            });
            
            memDb.exec(`DETACH DATABASE ${uniqueAlias}`);

            let renamed = false;
            let attempts = 0;
            
            while (!renamed && attempts < 5) {
                try {
                    if (fs.existsSync(targetPath)) {
                        try { fs.unlinkSync(targetPath); } catch (e) {
                            fs.writeFileSync(targetPath, fs.readFileSync(tmpPath));
                            renamed = true;
                            break;
                        }
                    }
                    fs.renameSync(tmpPath, targetPath);
                    renamed = true;
                } catch (err) {
                    attempts++;
                    const buffer = Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempts * 50);
                }
            }

            if (!renamed) {
                throw new Error(`EPERM: Windows lock on target destination could not be cleared after max retries.`);
            }

            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch(e) {}

            const status = "SUCCESS";
            const msg = `Dumped all tables to ${path.basename(targetPath)}`;
            logger(socket, "SYNC", cmd, status, msg);
            if (socket) sendJson(socket, { status, command: cmd, message: msg });
            return true;
        } catch (err) {
            try { memDb.exec(`DETACH DATABASE ${uniqueAlias}`); } catch(e) {}
            try { if(fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch(e) {}
            const status = "ERROR";
            const msg = err.message;
            logger(socket, "SYNC", cmd, status, msg);
            if (socket) sendJson(socket, { status: "error", command: cmd, message: msg });
            return false;
        }
    };

    const autoSyncInterval = setInterval(() => { if(!isShuttingDown) persistToDisk(); }, parseDuration(DT_RAW) * 1000);

    const server = tls.createServer({
        key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE), ca: fs.readFileSync(CA_FILE),
        requestCert: true, rejectUnauthorized: true
    }, (socket) => {
        logger(socket, "NETWORK", "TLS_CONNECT", "INFO", "Handshake successful");
        socket.cursor = { results: [], limit: 0, index: 0, total: 0 };
        socket.authSession = null;

        socket.on('data', (data) => {
            try {
                const req = JSON.parse(data.toString());
                commandQueue.push({ cmd: req.cmd, args: req.args || {}, socket });
                processQueue();
            } catch (e) {
                sendJson(socket, { status: "error", message: "Malformed JSON" });
            }
        });

        const handleDisconnection = () => {
            logger(socket, "NETWORK", "DISCONNECT", "INFO", "Connection closed");
            if (socket.authSession) {
                try {
                    memDb.prepare("UPDATE sessions SET status = 'inactive' WHERE token = ?").run(socket.authSession);
                    logger(socket, "SESSION", "AUTO_LOGOUT", "SUCCESS", `Logged out active session due to exit/disconnect context`);
                } catch (e) {
                    logger(socket, "SESSION", "AUTO_LOGOUT", "ERROR", e.message);
                }
            }
            persistToDisk();
        };

        socket.on('end', handleDisconnection);
        socket.on('close', handleDisconnection);
        socket.on('error', () => {});
    });

    function sendJson(socket, obj) {
        if (socket && !socket.destroyed && socket.writable) socket.write(JSON.stringify(obj) + '\n');
    }

    function sendCursorBatch(socket, finalize) {
        const c = socket.cursor;
        const batch = c.results.slice(c.index, c.index + c.limit);
        c.index += batch.length;
        const remaining = c.total - c.index;
        finalize(null, {
            items: batch,
            pagination: { index: c.index, limit: c.limit, total: c.total, remaining }
        });
    }

    function shutdownGracefully(reason, exitCode = 0) {
        if (isShuttingDown) return;
        isShuttingDown = true;
        
        logger(null, "SYSTEM", "SHUTDOWN", "INFO", `Shutdown event captured via reason: ${reason}`);
        
        clearInterval(autoSyncInterval);
        
        try {
            memDb.prepare("UPDATE sessions SET status = 'inactive' WHERE status = 'active'").run();
            logger(null, "SESSION", "CRITICAL_LOGOUT", "SUCCESS", "All active database sessions have been set to inactive state safely.");
        } catch (e) {
            console.error("Failed to invalidate session tables during process tear down:", e.message);
        }

        try {
            server.close();
        } catch (e) {}

        try {
            logger(null, "SYSTEM", "CRITICAL_DUMP", "INFO", "Attempting automatic memory state snapshot persistence into disk target file...");
            const success = persistToDisk(DB_PATH, null, 'shutdown-sync');
            if (success) {
                logger(null, "SYSTEM", "CRITICAL_DUMP", "SUCCESS", "Emergency exit state sync was processed effectively.");
            } else {
                logger(null, "SYSTEM", "CRITICAL_DUMP", "ERROR", "Emergency state snapshot persistence failed to execute properly.");
            }
        } catch (err) {
            console.error("Fatal failure encountered executing synchronous disk backup during runtime exit:", err);
        }

        try {
            memDb.close();
        } catch (e) {}

        process.exit(exitCode);
    }

    process.on('SIGINT', () => shutdownGracefully('SIGINT received (Keyboard Terminal Signal Interruption Context)', 130));
    process.on('SIGTERM', () => shutdownGracefully('SIGTERM received (System Process Termination Vector Context)', 143));

    process.on('uncaughtException', (err) => {
        logger(null, "SYSTEM", "CRASH", "FATAL", `Server Crash Uncaught Error Event: ${err.message}. StackTrace: ${err.stack}`);
        shutdownGracefully(`uncaughtException: ${err.message}`, 1);
    });

    process.on('unhandledRejection', (reason) => {
        logger(null, "SYSTEM", "CRASH", "FATAL", `Unhandled Asynchronous Promise Rejection Context detected.`);
        shutdownGracefully(`unhandledRejection: ${reason}`, 1);
    });

    function executeCommand(cmd, args, socket) {
        const command = cmd ? cmd.toLowerCase() : '';
        const writeCmds = ['set', 'delete', 'clear', 'init', 'load', 'sql', 'use', 'drop', 'groupadd', 'groupassign', 'groupremove', 'grant', 'revoke', 'register', 'passwd', 'login', 'logout'];
        if (writeCmds.includes(command)) globalLock = true;

        const finalize = (err, result) => {
            const status = err ? "ERROR" : "SUCCESS";
            logger(socket, "COMMAND", command, status, `Context: ${currentDatabase}${args.k ? ' | Target: '+args.k : ''}`);
            if (err) sendJson(socket, { status: "error", command, message: err.message });
            else sendJson(socket, { status: "success", command, data: result || [] });
            globalLock = false;
            processQueue();
        };

        if (command === 'next' && socket.cursor.results.length > 0) return sendCursorBatch(socket, finalize);
        const q = `%${args.q || ''}%`;

        try {
            switch (command) {
                case 'login': {
                    const username = args.k;
                    const rawPassword = args.v;
                    if (!username || !rawPassword) return finalize(new Error("Username and password required"));
                    const user = memDb.prepare("SELECT * FROM users WHERE username = ?").get(username);
                    if (!user || !bcrypt.compareSync(rawPassword, user.password)) {
                        return finalize(new Error("Invalid username or password"));
                    }
                    const token = crypto.randomBytes(32).toString('hex');
                    memDb.prepare("INSERT INTO sessions (token, user_id, username, email) VALUES (?, ?, ?, ?)").run(token, user.id, user.username, user.email);
                    
                    socket.authSession = token;

                    persistToDisk();
                    finalize(null, { session: token, username: user.username });
                    break;
                }
                case 'logout': {
                    const session = requireSession(args, socket);
                    memDb.prepare("UPDATE sessions SET status = 'inactive' WHERE token = ?").run(session.session);
                    socket.authSession = null;
                    persistToDisk();
                    finalize(null, "Logged out successfully");
                    break;
                }
                case 'passwd': {
                    const session = requireSession(args, socket);
                    const newPassword = args.v;
                    if (!newPassword) return finalize(new Error("New password required"));
                    const hashedPassword = bcrypt.hashSync(newPassword, 10);
                    memDb.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedPassword, session.userId);
                    persistToDisk();
                    finalize(null, "Password changed successfully");
                    break;
                }
                case 'use':
                    const tableToUse = (args.k || 'store').replace(/[^a-z0-9_]/gi, '');
                    memDb.exec(`CREATE TABLE IF NOT EXISTS ${tableToUse} (key TEXT PRIMARY KEY, value TEXT)`);
                    currentDatabase = tableToUse;
                    persistToDisk();
                    finalize(null, `Active table: ${tableToUse}`);
                    break;
                case 'drop':
                    const tableToDrop = (args.k || '').replace(/[^a-z0-9_]/gi, '');
                    if (!tableToDrop || tableToDrop === 'store') return finalize(new Error("Cannot drop default store"));
                    memDb.exec(`DROP TABLE IF EXISTS ${tableToDrop}`);
                    if (currentDatabase === tableToDrop) currentDatabase = 'store';
                    persistToDisk();
                    finalize(null, `Dropped table: ${tableToDrop}`);
                    break;
                case 'set': {
                    const session = requireSession(args, socket);
                    const key = args.k;
                    const value = args.v;
                    if (!key) return finalize(new Error("Key required"));
                    const row = memDb.prepare(`SELECT 1 FROM ${currentDatabase} WHERE key = ?`).get(key);
                    const action = row ? 'update' : 'create';
                    ensurePermission(session.userId, session.username, currentDatabase, key, action);
                    memDb.prepare(`INSERT OR REPLACE INTO ${currentDatabase} (key, value) VALUES (?, ?)`).run(key, value);
                    if (!row) {
                        recordAutomaticCreatorPermissions(session, currentDatabase, key);
                    }
                    finalize(null, "OK");
                    break;
                }
                case 'get': {
                    const session = requireSession(args, socket);
                    if (!args.k) return finalize(new Error("Key required"));
                    ensurePermission(session.userId, session.username, currentDatabase, args.k, 'read');
                    const getResult = memDb.prepare(`SELECT value FROM ${currentDatabase} WHERE key = ?`).get(args.k);
                    finalize(null, getResult ? [getResult] : []);
                    break;
                }
                case 'delete': {
                    const session = requireSession(args, socket);
                    if (!args.k) return finalize(new Error("Key required"));
                    ensurePermission(session.userId, session.username, currentDatabase, args.k, 'delete');
                    memDb.prepare(`DELETE FROM ${currentDatabase} WHERE key = ?`).run(args.k);
                    finalize(null, "Deleted");
                    break;
                }
                case 'clear': {
                    const session = requireSession(args, socket);
                    ensurePermission(session.userId, session.username, currentDatabase, '*', 'delete');
                    memDb.prepare(`DELETE FROM ${currentDatabase}`).run();
                    finalize(null, "Cleared");
                    break;
                }
                case 'scan': {
                    const session = requireSession(args, socket);
                    const limit = parseInt(args.n || '100', 10);
                    const authorizedKeys = getAuthorizedKeys(session.userId, session.username, currentDatabase, 'read');
                    let scanResults;
                    if (authorizedKeys === null) {
                        scanResults = memDb.prepare(`SELECT key, value FROM ${currentDatabase} WHERE key LIKE ?`).all(q);
                    } else if (authorizedKeys.length > 0) {
                        const bindings = authorizedKeys.map(() => '?').join(',');
                        scanResults = memDb.prepare(`SELECT key, value FROM ${currentDatabase} WHERE key LIKE ? AND key IN (${bindings})`).all(q, ...authorizedKeys);
                    } else {
                        scanResults = [];
                    }
                    socket.cursor = { results: scanResults, limit, index: 0, total: scanResults.length };
                    sendCursorBatch(socket, finalize);
                    break;
                }
                case 'keys': {
                    const session = requireSession(args, socket);
                    const limit = parseInt(args.n || '100', 10);
                    const authorizedKeys = getAuthorizedKeys(session.userId, session.username, currentDatabase, 'read');
                    let keyResults;
                    if (authorizedKeys === null) {
                        keyResults = memDb.prepare(`SELECT key FROM ${currentDatabase} WHERE key LIKE ?`).all(q);
                    } else if (authorizedKeys.length > 0) {
                        const bindings = authorizedKeys.map(() => '?').join(',');
                        keyResults = memDb.prepare(`SELECT key FROM ${currentDatabase} WHERE key LIKE ? AND key IN (${bindings})`).all(q, ...authorizedKeys);
                    } else {
                        keyResults = [];
                    }
                    socket.cursor = { results: keyResults, limit, index: 0, total: keyResults.length };
                    sendCursorBatch(socket, finalize);
                    break;
                }
                case 'register': {
                    const username = args.k;
                    const rawPassword = args.v;
                    const email = args.f;
                    if (!username || !rawPassword || !email) {
                        return finalize(new Error("Username, password, and email (-f) are required"));
                    }
                    const hashedPassword = bcrypt.hashSync(rawPassword, 10);
                    const userResult = memDb.prepare(`INSERT INTO users (username, password, email) VALUES (?, ?, ?)`).run(username, hashedPassword, email);
                    const newUserId = userResult.lastInsertRowid;
                    if (args.resource_table) {
                        const permString = args.permissions || 'read';
                        const canRead = permString.includes('read') ? 1 : 0;
                        const canCreate = permString.includes('create') ? 1 : 0;
                        const canUpdate = permString.includes('update') ? 1 : 0;
                        const canDelete = permString.includes('delete') ? 1 : 0;
                        const resourceKey = args.resource || '*';
                        memDb.prepare(`INSERT INTO access_controls (resource_table, resource_key, principal_type, principal_id, principal_name, can_read, can_create, can_update, can_delete) VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?)`).run(
                            args.resource_table, resourceKey, newUserId, username, canRead, canCreate, canUpdate, canDelete
                        );
                    }
                    persistToDisk();
                    finalize(null, "User registered successfully");
                    break;
                }
                default:
                    finalize(new Error(`Unknown command ${command}`));
                    break;
            }
        } catch (e) {
            finalize(e);
        }
    }

    server.listen(PORT, HOST, () => {
        logger(null, "NETWORK", "BOOT_SERVER", "SUCCESS", `Secure TLS Database Server listening on tls://${HOST}:${PORT}`);
    });
}

// --- SHELL (CLIENT) MODE ---
if (MODE === 'shell') {
    let clientSocket = null;
    let authSession = null;
    let pendingCommand = null;
    let activePromptMode = 'default';
    let loginUsername = '';
    let currentUsernameLabel = 'user';

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `user@${HOST}:${PORT}> `
    });

    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
        if (activePromptMode === 'login_password') {
            if (stringToWrite === '\r\n' || stringToWrite === '\n' || stringToWrite === '\r') {
                originalWrite.call(rl, stringToWrite);
            } else if (stringToWrite.startsWith('password: ')) {
                originalWrite.call(rl, stringToWrite);
            } else {
                originalWrite.call(rl, '*'.repeat(stringToWrite.length));
            }
        } else {
            originalWrite.call(rl, stringToWrite);
        }
    };

    const initClient = () => {
        clientSocket = tls.connect({
            host: HOST, port: PORT,
            key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE), ca: fs.readFileSync(CA_FILE),
            rejectUnauthorized: true
        }, () => {
            rl.prompt();
        });

        let dataBuffer = '';
        clientSocket.on('data', (data) => {
            dataBuffer += data.toString();
            let boundary = dataBuffer.indexOf('\n');
            while (boundary !== -1) {
                const line = dataBuffer.substring(0, boundary).trim();
                dataBuffer = dataBuffer.substring(boundary + 1);
                if (line) {
                    try {
                        const res = JSON.parse(line);
                        if (res.command === 'login') {
                            if (res.status === 'success' && res.data && res.data.session) {
                                authSession = res.data.session;
                                currentUsernameLabel = res.data.username || 'user';
                                rl.setPrompt(`${currentUsernameLabel}@${HOST}:${PORT}> `);
                            } else if (res.status === 'error') {
                                console.log("invalid login username or password");
                            }
                        }
                        if (res.command === 'logout') {
                            authSession = null;
                            currentUsernameLabel = 'user';
                            rl.setPrompt(`user@${HOST}:${PORT}> `);
                        }
                        
                        if (res.command !== 'login' || res.status !== 'error') {
                            console.log(JSON.stringify(res, null, 2));
                        }
                    } catch (e) {
                        console.log(line);
                    }
                }
                boundary = dataBuffer.indexOf('\n');
            }
            rl.prompt();
        });

        clientSocket.on('end', () => {
            console.log("\n\x1b[33m[INFO]\x1b[0m Connection closed by remote server.");
            process.exit(0);
        });

        clientSocket.on('error', (err) => {
            console.error(`\x1b[31m[ERROR]\x1b[0m TLS Connection Fault: ${err.message}`);
            process.exit(1);
        });
    };

    try {
        initClient();
    } catch (err) {
        console.error(`\x1b[31m[ERROR]\x1b[0m Failed to start shell: ${err.message}`);
        process.exit(1);
    }

    rl.on('line', (line) => {
        const raw = line.trim();

        if (activePromptMode === 'login_password') {
            activePromptMode = 'default';
            rl.setPrompt(`${currentUsernameLabel}@${HOST}:${PORT}> `);

            const payload = JSON.stringify({
                cmd: 'login',
                args: {
                    k: loginUsername,
                    v: raw,
                    session: authSession
                }
            });

            if (clientSocket && !clientSocket.destroyed) {
                clientSocket.write(payload);
            } else {
                console.error("\x1b[31m[ERROR]\x1b[0m Connection to server is lost.");
                rl.close();
            }
            return;
        }

        if (!raw) {
            rl.prompt();
            return;
        }

        if (activePromptMode === 'confirm') {
            activePromptMode = 'default';
            rl.setPrompt(`${currentUsernameLabel}@${HOST}:${PORT}> `);

            if (raw.toLowerCase() === 'y' || raw.toLowerCase() === 'yes') {
                if (clientSocket && !clientSocket.destroyed) {
                    clientSocket.write(pendingCommand);
                }
            } else {
                console.log("Action aborted.");
                rl.prompt();
            }
            pendingCommand = null;
            return;
        }

        const parts = raw.split(/\s+/);
        const cmd = parts[0].toLowerCase();

        if (cmd === 'exit' || cmd === 'quit') {
            rl.close();
            return;
        }

        if (cmd === 'login') {
            loginUsername = parts[1];
            if (!loginUsername) {
                console.error("\x1b[31m[ERROR]\x1b[0m Usage: login <username>");
                rl.prompt();
                return;
            }
            activePromptMode = 'login_password';
            rl.setPrompt('password: ');
            rl.prompt();
            return;
        }
        
        const findArg = (flag) => { const idx = parts.indexOf(flag); return idx !== -1 ? parts[idx + 1] : null; };
        const cmdData = (line.match(/-cmd\s+`([^`]+)`/) || [])[1];

        const payload = JSON.stringify({
            cmd, args: {
                k: parts[1], 
                v: parts[2], 
                q: parts[1], 
                f: findArg('-f'),
                n: findArg('-n'), 
                resource: findArg('-resource') || findArg('-r'),
                principal: findArg('-principal') || findArg('-pr'),
                principal_type: findArg('-principal-type') || findArg('-pt'),
                permissions: findArg('-permissions') || findArg('-perm'),
                resource_table: findArg('-db') || findArg('-database'),
                group: findArg('-group') || findArg('-g'),
                user: findArg('-user') || findArg('-u'),
                sql: (cmd === 'sql') ? cmdData : null,
                data: (cmd === 'init') ? cmdData : null,
                session: authSession
            }
        });

        if (['clear', 'drop', 'init'].includes(cmd)) {
            pendingCommand = payload;
            activePromptMode = 'confirm';
            rl.setPrompt(`\x1b[31m[DANGER]\\x1b[0m Confirm ${cmd} ${parts[1] || ''}? (y/n): `);
            rl.prompt();
        } else {
            if (clientSocket && !clientSocket.destroyed) {
                clientSocket.write(payload);
            } else {
                console.error("\x1b[31m[ERROR]\x1b[0m Connection to server is lost.");
                rl.close();
            }
        }
    });

    rl.on('close', () => {
        if (clientSocket && !clientSocket.destroyed) clientSocket.end();
        process.exit(0);
    });
}