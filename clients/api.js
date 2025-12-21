var tls = require('tls');
var fs = require('fs');

// use	Switches context to a specific table. Creates it if it doesn't exist.
// set	Upserts a key-value pair. Values are stored as strings (stringify objects first).
// get	Retrieves the value for a specific key.
// search	Performs a fuzzy match against both keys and values.
// tables	Returns a list of all custom tables (key-value stores) in the database.
// sql	Runs a raw SQLite query against the in-memory state.
// dump	Triggers an immediate VACUUM INTO the persistent .sqlite file.
// del	Removes a single key from the current table.
// clear	Deletes all records in the active table context.
// drop	Deletes the entire table structure from the database.

/**
 * TLite Client API - Callback Version
 */
function ClientAPI(config, onConnect) {
    var client = tls.connect({
        host: config.host || 'localhost',
        port: config.port || 9999,
        ca: fs.readFileSync(config.ca || 'ca.crt'),
        cert: fs.readFileSync(config.cert || 'client.crt'),
        key: fs.readFileSync(config.key || 'client.key'),
        rejectUnauthorized: true
    }, onConnect);

    var buffer = '';
    var callbackQueue = [];

    client.on('data', function(data) {
        buffer += data.toString();
        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var i = 0; i < lines.length; i++) {
            if (lines[i].trim()) {
                try {
                    var response = JSON.parse(lines[i]);
                    var cb = callbackQueue.shift();
                    if (cb) cb(null, response);
                } catch (e) {
                    var cb = callbackQueue.shift();
                    if (cb) cb(e);
                }
            }
        }
    });

    /**
     * Internal request handler
     */
    client.request = function(cmd, args, cb) {
        callbackQueue.push(cb || function() {});
        client.write(JSON.stringify({ cmd: cmd, args: args || {} }) + '\n');
    };

    // --- API Methods ---
    return {
        use: function(k, cb) { client.request('use', { k: k }, cb); },
        drop: function(k, cb) { client.request('drop', { k: k }, cb); },
        set: function(k, v, cb) { client.request('set', { k: k, v: v }, cb); },
        get: function(k, cb) { client.request('get', { k: k }, cb); },
        del: function(k, cb) { client.request('delete', { k: k }, cb); },
        clear: function(cb) { client.request('clear', {}, cb); },
        tables: function(cb) { client.request('tables', {}, cb); },
        list: function(n, cb) { client.request('list', { n: n }, cb); },
        next: function(cb) { client.request('next', {}, cb); },
        search: function(q, cb) { client.request('search', { q: q }, cb); },
        searchKey: function(q, cb) { client.request('searchkey', { q: q }, cb); },
        searchValue: function(q, cb) { client.request('searchvalue', { q: q }, cb); },
        sql: function(sql, cb) { client.request('sql', { sql: sql }, cb); },
        dump: function(cb) { client.request('dump', {}, cb); },
        close: function() { client.destroy(); }
    };
}


/**
 * TLite Client API - Promise Version
 */
function ClientPromiseAPI(config) {
    return new Promise(function(resolve, reject) {
        var client = tls.connect({
            host: config.host || 'localhost',
            port: config.port || 9999,
            ca: fs.readFileSync(config.ca || 'ca.crt'),
            cert: fs.readFileSync(config.cert || 'client.crt'),
            key: fs.readFileSync(config.key || 'client.key'),
            rejectUnauthorized: true
        });

        var buffer = '';
        var callbackQueue = [];

        client.on('connect', function() {
            // Return the API object once connected
            resolve({
                use: function(k) { return this.request('use', { k: k }); },
                drop: function(k) { return this.request('drop', { k: k }); },
                set: function(k, v) { return this.request('set', { k: k, v: v }); },
                get: function(k) { return this.request('get', { k: k }); },
                del: function(k) { return this.request('delete', { k: k }); },
                clear: function() { return this.request('clear', {}); },
                tables: function() { return this.request('tables', {}); },
                list: function(n) { return this.request('list', { n: n }); },
                next: function() { return this.request('next', {}); },
                search: function(q) { return this.request('search', { q: q }); },
                searchKey: function(q) { return this.request('searchkey', { q: q }); },
                searchValue: function(q) { return this.request('searchvalue', { q: q }); },
                sql: function(sql) { return this.request('sql', { sql: sql }); },
                dump: function() { return this.request('dump', {}); },
                close: function() { client.destroy(); },

                // Internal Promisified Request
                request: function(cmd, args) {
                    return new Promise(function(res, rej) {
                        callbackQueue.push({ resolve: res, reject: rej });
                        client.write(JSON.stringify({ cmd: cmd, args: args || {} }) + '\n');
                    });
                }
            });
        });

        client.on('data', function(data) {
            buffer += data.toString();
            var lines = buffer.split('\n');
            buffer = lines.pop();
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].trim()) {
                    try {
                        var response = JSON.parse(lines[i]);
                        var promise = callbackQueue.shift();
                        if (promise) promise.resolve(response);
                    } catch (e) {
                        var promise = callbackQueue.shift();
                        if (promise) promise.reject(e);
                    }
                }
            }
        });

        client.on('error', function(err) { reject(err); });
    });
}

module.exports = {
ClientAPI,
ClientPromiseAPI
}