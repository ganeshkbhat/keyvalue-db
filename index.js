const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const readline = require('readline');
const JsonManager = require("json-faster").JsonManager;
const express = require('express');
const path = require("path");

// options = { username, password, key, cert, middlewares: [], apps: null }
function startServer(port, hostname = "localhost", options = {}, apps = [], middlewares = [], loadObject = {}) {
    const app = express();
    const datetime = Date.now();
    const PORT = port || 7000;
    const HOSTNAME = hostname || "localhost";

    // Use express.json() to parse incoming JSON bodies
    app.use(express.json());

    // Set server start datatime 
    app.datetime = datetime;

    // if (!!apps || apps !== undefined) app.use(apps);
    if (!!middlewares.length) app.use(middlewares);

    // for testinng
    loadObject = {
        12: 20000,
        879898: ["test", "for", "alues"],
        "testing": "for alues",
        "123tsj": "testing",
        "store": ["vaue", "loads", 10],
        'user_id': 101,
        'username': 'alpha_user',
        'status': 'Active',
        'tags': ['premium', 'new_member', 'verified'],
        'location': 'New York City',
        'last_login': '2025-11-10',
        'settings': { theme: 'dark', notifications: true },
        'scores': [95, 88, 92]
    }

    // Instantiate the manager for 'Item' entities
    app.dataManager = new JsonManager();
    app.dataManager.init(loadObject);

    function ensureNumeric(value) {
        // Attempt to convert the value to a number. 
        // This works on both number strings and existing number types.
        const numberValue = Number(value);

        // Check if the result is NOT 'Not-a-Number'.
        if (!isNaN(numberValue)) {
            // Successfully converted or was already a number
            return numberValue;
        }

        // If it's NaN, the original value was not a convertible number string
        return value;
    }

    /**
     * GET route for debugging: shows the current state of the JSON store.
     */
    app.get('/', (req, res) => {
        // console.log(app.mgr.dump())
        res.status(200).json({
            status: 'ok',
            // store_state: app.mgr.dump(),
            serverStartDateTime: app.datetime,
            requestDateTime: Date.now(),
            message: 'Current state of the JSON manager.',
            data: "hello"
        });
    });

    app.get('/health', (req, res) => {
        // console.log(app.mgr.dump())
        res.status(200).json({
            status: 'ok',
            serverStartDateTime: app.datetime,
            requestDateTime: Date.now(),
            // store_state: app.mgr.dump(),
            message: 'Current state of the singleton JSON manager.',
            data: {} // app.dataManager.dump()
        });
    });

    // 4. HTTP Connection Handler
    // This route manages all operations based on req.body.event and req.body.data {key, value, other}

    app.post('/', (req, res) => {
        // Expected payload format: { event: 'action', key?: string, value?: object }
        // Renamed 'id' to 'key' for clarity in this handler
        const { event, data, options } = req.body;
        // needed created same named values to create or update
        var allItems, foundItem, createdItem, updatedItem, deletedItems, allDumpItems, allDumpKeyItems, allDumpKeysItems, allsearchItems, allSearchValueItems, allSearchKeyValueItems, dValue, deleted;

        if (!event) {
            return res.status(400).json({ status: 'error', message: 'Missing required field: event (e.g., "set", "get", "dump", "update", "remove")' });
        }

        try {
            switch (event.toLowerCase()) {
                case 'set':
                    // CREATE: Uses 'set' as the event name
                    // minor codebase to test http protocol for kvjson [to be extended to ws and wss]
                    // 
                    // event name is "set"
                    // data values are key, value 
                    // data = { "key": "setkey", "value": "setvalue" }
                    // 
                    // {"event": "set", "data": {"key": "23v", "value": "12334fmc"}}
                    // {"event": "set", "data": {"key": "2", "value": "123fmc"}}
                    // {"event": "set", "data": {"key": 12, "value": 123}}
                    try {
                        if (!data.key || !data.value) {
                            return res.status(400).json({ status: 'error', event: event, message: 'Missing required fields: "key" (string) and "value" (object) for "set" event.' });
                        }

                        // {"event": "set", "data": { "key": 12, "value": "tests" }} 
                        //  >> {"event": "set", "data": { "key": "12", "value": "tests" }}
                        // data.key = ensureNumeric(data.key)
                        // data.value = ensureNumeric(data.value)

                        app.dataManager.write(data.key, data.value)
                        // console.log(5, data.key, data.value)
                        return res.status(200).json({ status: 'success', event: event, data: { ...app.dataManager.read(data.key) } });
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, data: { key: data.key, error: e } });
                    }
                case 'create':
                    // // CREATE: Uses 'create' as the event name
                    // // minor codebase to test http protocol for kvjson [to be extended to ws and wss]
                    // // 
                    // // event name is "set"
                    // // data values are key, value pairs in as an array
                    // // {"event": "create", "data": [{"key": 12, "value": "test"}, {"key": "12sdf", "value": "test"}]}
                    // // // {"event": "create", "data": [{ "key": "100", "value": "testing" }, { "key": "10minimum0", "value": "testing" } ]}
                    // if (!data.key || !data.value) {
                    //     return res.status(400).json({ status: 'error', event: event, message: 'Missing required fields: "key" (string) and "value" (object) for "set" event.' });
                    // }
                    try {
                        let result = {}
                        if (Array.isArray(data) && data.length) {
                            for (let i = 0; i < data.length; i++) {
                                // data[i].key = ensureNumeric(data[i].key)
                                // data[i].value = ensureNumeric(data[i].value)
                                result[data[i].key] = data[i].value
                                app.dataManager.write(data[i].key, data[i].value)
                                console.log("data[i].key, data[i].value :", data[i].key, data[i].value)
                            }
                        }
                        return res.status(200).json({ status: 'success', event: event, data: result });
                    } catch (e) {
                        return res.status(400).json({ status: 'error', event: event, message: 'Missing required fields: "key" (string) and "value" (object) for "create" event.' });
                    }
                case 'get':
                    // read: Uses 'read' or 'get' or 'getkey' as the event name
                    // READ ONE: Uses 'get' as the event name
                    // minor codebase to test http protocol for kvjson [to be extended to ws and wss]
                    // 
                    // event name is "get"
                    // data value is key
                    // "data": {"key": "test"}
                    // 
                    // // read or get keys
                    // {"event": "get", "data": {  }} 
                    // {"event": "get", "data": { "key": "setkey" }}
                    // {"event": "get", "data": {"key": 12 }}
                    if (!data.key) {
                        return res.status(400).json({ status: 'error', event: event, message: 'Missing "key" field for "get" event.' });
                    }
                    // createKey is false by default
                    foundItem = app.dataManager.getKey(data.key, { createKey: false });
                    if (!foundItem) {
                        return res.status(404).json({ status: 'error', event: event, message: `Item with key "${data.key}" not found.` });
                    }
                    return res.status(200).json({ status: 'success', event: event, data: { [data.key]: app.dataManager.get(data.key) } });
                // return res.status(200).json({ status: 'success', event: event, data: { [data.key]: foundItem } });
                case 'read':
                    // read: Uses 'read' or 'get' or getkey as the event name
                    // READ ONE: Uses 'get' as the event name
                    // minor codebase to test http protocol for kvjson [to be extended to ws and wss]
                    // 
                    // event name is "read"
                    // data key-values is key
                    // "data": {"key": "test"}
                    // 
                    // // read or get keys
                    // {"event": "read", "data": {"key": "test"}} 
                    // {"event": "read", "data": {"key": "2"}}
                    // {"event": "read", "data": {"key": 12}}
                    if (!data.key) {
                        return res.status(400).json({ status: 'error', event: event, message: 'Missing "key" field for "get" event.' });
                    }
                    try {
                        // createKey is false by default
                        foundItem = app.dataManager.read(data.key, { createKey: false });
                        if (!foundItem && (foundItem !== undefined || foundItem !== null)) {
                            return res.status(404).json({ status: 'error', event: event, message: `Item with key "${data.key}" not found.` });
                        }
                        return res.status(200).json({ status: 'success', event: event, data: { ...foundItem } });
                    } catch (e) {
                        return res.status(500).json({ status: 'error', event: event, error: e, message: `Item with key "${data.key}" not found.` });
                    }
                case 'update':
                    // UPDATE: Uses 'update' as the event name
                    // // read or get keys
                    // 
                    // event name is "update"
                    // data key-values is key and value is value
                    // "data": {"key": "test", value: "value to update for test"}
                    // 
                    // {"event": "update", "data": {"test": "testing"}}
                    // {"event": "update", "data": {"2": 23}}
                    // {"event": "update", "data": {12: "testing23", "test": "testing", 34:testing}}
                    // data now will be {"oldkeys":"new value", 12: "testing23", "test": "testing", 34:testing}}

                    try {
                        let obj = data
                        app.dataManager.update(obj);
                        return res.status(201).json({ status: 'success', event: event, data: obj });
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, error: e });
                    }
                case 'dump':
                    // LIST ALL: Uses 'dump' as the event name
                    // 
                    // // event name is "update"
                    // {"event": "dump", "data": {}}
                    // {"event": "dump"}

                    try {
                        let allDumpItems = app.dataManager.dump();
                        return res.status(200).json({ status: 'success', event: event, data: allDumpItems, count: allDumpItems?.length });
                    }
                    catch (e) {
                        return res.status(400).json({ status: 'error', event: event, message: 'Missing "key" or wrong data field for "dump" event.' });
                    }
                case 'dumpkey':
                    // LIST ALL: Uses 'dump' as the event name to return keys requested
                    // 
                    // // ERROR IN CODE: dumps all keys with like true option whendumpkeys is used
                    let allDumpSearchKeyItems
                    try {
                        // if (!!Array.isArray(data.keys) && !!data.keys) {
                        // map to respond all keys in the requested data send back in an object data. 
                        // data: {key: value, key2: value2}
                        let like = options?.like || false
                        let regex = options?.regex || false
                        let type = options?.type || "keyvalue"
                        try {
                            allDumpSearchKeyItems = app.dataManager.searchKeys(data.key, { like: options?.like ? options?.like : false });
                            return res.status(200).json({ status: 'success', event: event, data: allDumpSearchKeyItems, count: allDumpSearchKeyItems?.length })
                        } catch (e) {
                            return res.status(500).json({ status: 'failed', event: event, data: allDumpSearchKeyItems, count: allDumpSearchKeyItems?.length });
                        }
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, data: allDumpSearchKeyItems, count: allDumpSearchKeyItems?.length, error: e });
                    }
                // case 'dumpkeys':
                //     // LIST ALL: Uses 'dump' as the event name to return keys requested
                //     // 
                //     // // ERROR IN CODE: dumps all keys with like true option when dumpkeys is used
                //     let allDumpKeysItems
                //     try {
                //         // if (!!Arr/ay.isArray(data.keys) && !!data.keys) {
                //         // map to respond all keys in the requested data send back in an object data. 
                //         // data: {key: value, key2: value2}
                //         let like = options?.like || false
                //         let regex = options?.regex || false
                //         let type = options?.type || "keyvalue"
                //         try {
                //             allDumpKeysItems = app.dataManager.dumpKeys(data.keys, { like: options?.like ? options?.like : false }, "search");
                //             return res.status(200).json({ status: 'success', event: event, data: allDumpKeysItems, count: allDumpKeysItems?.length })
                //         } catch (e) {
                //             return res.status(500).json({ status: 'failed', event: event, data: allDumpKeysItems, count: allDumpKeysItems?.length, error: e });
                //         }
                //     } catch (e) {
                //         return res.status(500).json({ status: 'failed', event: event, data: allDumpKeysItems, count: allDumpKeysItems?.length, error: e });
                //     }
                case 'load':
                    // // same as init: Uses 'load' as the event name
                    let c
                    try {
                        c = app.dataManager.load(data)
                        // console.log(app.dataManager.dump())
                        return res.status(200).json({ status: 'success', event: event, data: c })
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, error: e });
                    }
                case 'init':
                    // case 'init':
                    //     // // same as set: Uses 'init' as the event name
                    // { "event": "init", "data": { "testmy data": "new data", "testing": "alues new" }}
                    //      >> will only have above data since it is init

                    try {
                        app.dataManager.init(data)
                        return res.status(200).json({ status: 'success', event: event, data: data })
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, data: e });
                    }
                case 'search':
                    let allsearchItems
                    try {

                        // searches key and value
                        // keys should be an array
                        // //
                        // // { "event": "search", "data": { "keys": ["testing"] }}
                        // // {"event":"search", "data": {"keys" : 14}, "options": {"like": true}}
                        // // {"event":"search", "data": {"keys" : 12}, "options": {"like": true}}
                        // // {"event":"search", "data": {"keys" : ["12", "testing", "50"]}, "options": {"like": true}}
                        // // {"event":"search", "data": {"keys" : ["12", "test", "50"]}, "options": {"like": true}}
                        // // 
                        // // options like : true/ false
                        // // 12 is different from "12" is different from ["12"] is different from [12]
                        // // "tsj" is different from "ts" is different from ["ts"] is different from ["tsj"]
                        allsearchItems = app.dataManager.search(data.keys, { like: options?.like ? options?.like : false });
                        return res.status(200).json({ status: 'success', event: event, data: allsearchItems, count: allsearchItems?.length });
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, data: allsearchItems, count: allsearchItems?.length, error: e });
                    }
                case 'searchvalues':

                    // // 
                    // // { "event": "search", "data": { "keys": ["testing"] },  "type": "keyvalue", options = { like: true, regex: false} }
                    // // { "event": "search", "data": {"keys" : ["12", "testing", "50"]}, "options": {"like": false}}
                    // // 
                    // // options like : true/ false
                    // // 12 is different from "12" is different from ["12"] is different from [12]
                    // // "tsj" is different from "ts" is different from ["ts"] is different from ["tsj"]
                    let allSearchValueItems
                    try {
                        allSearchValueItems = app.dataManager.searchValues(data.keys, { like: options?.like ? options?.like : false });
                        return res.status(200).json({ status: 'success', event: event, data: allSearchValueItems, count: allSearchValueItems?.length });
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, data: allSearchValueItems, count: allSearchValueItems?.length, error: e });
                    }
                case 'searchkeys':

                    // // 
                    // // { "event": "search", "data": { "keys": ["testing"] },  "type": "keyvalue", options = { like: true, regex: false} }
                    // // { "event": "search", "data": {"keys" : ["12", "testing", "50"]}, "options": {"like": false}}
                    // // 
                    // // options like : true/ false
                    // // 12 is different from "12" is different from ["12"] is different from [12]
                    // // "tsj" is different from "ts" is different from ["ts"] is different from ["tsj"]
                    let allSearchKeysItems
                    try {
                        allSearchKeysItems = app.dataManager.searchKeys(data.keys, { like: options?.like ? options?.like : false });
                        return res.status(200).json({ status: 'success', event: event, data: allSearchKeysItems, count: allSearchKeysItems?.length });
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, data: allSearchKeysItems, count: allSearchKeysItems?.length, error: e });
                    }
                case 'searchkeyvalues':
                    // : 
                    // // :
                    // { "event": "searchkeyvalue", "data": { "keys": [12, "testing", "store"] }, "type": "keyvalue" }
                    // 
                    //      >> give back all key values and value values in 
                    //      >>    the json key or value string searches
                    // // {"event":"searchkeyvalue", "data": {"keys" : ["12", "testing", "50"]}, "options": {"like": false}}
                    // // 
                    // // options like : true/ false
                    // // 12 is different from "12" is different from ["12"] is different from [12]
                    // // "tsj" is different from "ts" is different from ["ts"] is different from ["tsj"]
                    try {
                        allSearchKeyValueItems = app.dataManager.searchKeyValues(data.keys, { like: options?.like ? options?.like : false });
                        return res.status(200).json({ status: 'success', event: event, data: allSearchKeyValueItems, count: allSearchKeyValueItems?.length })
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, data: allSearchKeyValueItems, count: allSearchKeyValueItems?.length });
                    }
                case 'delete':
                    // DELETE: Uses 'remove' as the event name
                    // this event delete removes/deletes the key send in the data with event details
                    // // {"event": "delete", "data": {"key": "12" }}
                    // if (!data.key) {
                    //     return res.status(400).json({ status: 'error', event: event, data: {}, message: 'Missing "key" field for "remove" event.' });
                    // }
                    try {
                        deleted = app.dataManager.deleteKey(data.key);
                        if (!deleted) throw new Error("the key was not deleted")
                        return res.status(200).json({ status: 'success', event: event, data: { key: data.key }, message: `Item with key "${data.key}" successfully removed.` })
                    } catch (e) {

                        return res.status(500).json({ status: 'failed', event: event, data: {}, error: e });
                    }
                case 'deletekey':
                    // DELETEKEY: Uses 'remove' as the event name
                    // this event delete removes/deletes the key send in the data with event details
                    // // {"event": "delete", "data": {"key": "12" }}
                    // if (!data.key) {
                    //     return res.status(400).json({ status: 'error', event: event, data: {}, message: 'Missing "key" field for "remove" event.' });
                    // }
                    try {
                        deleted = app.dataManager.deleteKey(data.key);
                        if (!deleted) throw new Error("the key was not deleted")
                        return res.status(200).json({ status: 'success', event: event, data: { key: data.key }, message: `Item with key "${data.key}" successfully removed.` })
                    } catch (e) {

                        return res.status(500).json({ status: 'failed', event: event, data: {}, error: e });
                    }
                case 'deletekeys':
                    // DELETE: Uses 'remove' as the event name

                    try {
                        deleted = app.dataManager.deleteKeys(data.keys);
                        if (!deleted) throw new Error("the key was not deleted")
                        return res.status(200).json({ status: 'success', event: event, data: { key: deleted }, message: `Item with key "${data.key}" successfully removed.` })
                    } catch (e) {

                        return res.status(500).json({ status: 'failed', event: event, data: {}, error: e });
                    }

                case 'remove':
                    // this event delete removes/deletes the key send in the data with event details
                    // // {"event": "delete", "data": {"key": "12" }}
                    // remove event > same as delete. intent was to allow one for single and another for array
                    // if (!data.keys) {
                    //     return res.status(400).json({ status: 'error', event: event, data: {}, message: 'Missing "key" field for "remove" event.' });
                    // }
                    try {

                        let rValue = app.dataManager.deleteKeys(data.keys); // <<
                        // console.log("rValue remove", rValue)
                        // for (let i = 0; i < rValue.length; i++) {
                        //     app.dataManager.deleteKey(rValue[i].key);
                        // }
                        // deleted = app.dataManager.deleteKey(data.key);
                        // if (!deleted) {
                        //     return res.status(404).json({ status: 'error', event: event, message: `Item with key "${data.key}" not found for deletion.` });
                        // }
                        return res.status(200).json({ status: 'success', event: event, data: { keys: rValue }, message: `Item with key "${data.keys}" successfully removed.` });
                    } catch (e) {
                        return res.status(500).json({ status: 'failed', event: event, data: {}, error: e });
                    }
                default:
                    return res.status(400).json({ status: 'error', event: event ? event : "unknown", message: `Unknown event type: ${event}` });
            }
        } catch (error) {
            console.error(`Error processing event ${event}:`, error);
            return res.status(500).json({ status: 'error', message: 'Internal server error', details: error.message });
        }
    });


    function gracefulShutdown(signal) {

        // exit, beforeExit, uncaughtException, unhandledRejection
        // SIGINT, SIGTERM, SIGHUP, SIGKILL
        // https://gemini.google.com/share/89826dd9c5f1

        console.log(`\nReceived signal: ${signal}. Starting graceful shutdown...`);

        // **1. Stop accepting new requests (e.g., close HTTP server)**
        // Server.close() is a common asynchronous cleanup operation.
        if (app.server) { // Assuming your server is in a global/accessible variable
            app.server.close(() => {
                console.log('HTTP server closed.');
                // **2. Perform other cleanup**
                process.exit(0);
            });
        } else {
            // If no server or pending async tasks, just exit
            process.exit(0);
        }
    }

    // 📌 Handle explicit exit signals (e.g., Ctrl+C, kill command)
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    process.on('uncaughtException', (err) => {
        console.error('Caught unhandled exception:', err);
        // Perform cleanup or graceful shutdown
        // app.dataManager.dump
        process.exit(1);
    });

    process.on('SIGINT', () => {
        console.log('Received SIGINT. Shutting down gracefully...');
        // Perform cleanup
        // app.dataManager.dump
        process.exit(0);
    });

    // 4. Server Start
    app.server = app.listen(PORT, HOSTNAME, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Use POST requests to the root path '/' with a JSON body.`);
    });

    return app
}

startServer()


module.exports = startServer;
