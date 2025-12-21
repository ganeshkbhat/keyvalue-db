var tls = require('tls');
var fs = require('fs');
var createTLiteClient = require("../clients/api.js").ClientAPI

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

// --- CONFIGURATION ---
var config = {
    host: 'localhost',
    port: 8000,
    ca: './certs/ca.crt',
    cert: './certs/client.crt',
    key: './certs/client.key'
};

// --- START DEMO ---
var db = createTLiteClient(config, function() {
    console.log("🚀 Connected to TLite Server. Starting full command demo...\n");

    // 1. Table Context & Creation
    db.use('demo_table', function(err, res) {
        console.log("1. USE/CREATE TABLE:", res.status);

        // 2. SET - Basic String
        db.set('name', 'Ganesh', function(err, res) {
            console.log("2. SET STRING:", res.status);

            // 3. SET - JSON Object
            db.set('profile', JSON.stringify({ age: 30, city: 'Bangalore' }), function(err, res) {
                console.log("3. SET JSON:", res.status);

                // 4. GET
                db.get('name', function(err, res) {
                    console.log("4. GET NAME:", res.data.value);

                    // 5. SEARCH (Global search in keys and values)
                    db.search('Bangalore', function(err, res) {
                        console.log("5. SEARCH RESULT COUNT:", res.data.length);

                        // 6. TABLES (List all key-value stores)
                        db.tables(function(err, res) {
                            console.log("6. EXISTING TABLES:", res.data.map(t => t.name).join(', '));

                            // 7. SQL (Custom Query)
                            db.sql("SELECT count(*) as total FROM demo_table", function(err, res) {
                                console.log("7. SQL COUNT:", res.data[0].total);

                                // 8. DUMP (Force sync to disk)
                                db.dump(function(err, res) {
                                    console.log("8. DUMP TO DISK:", res.status);

                                    // 9. DELETE (Single key)
                                    db.del('name', function(err, res) {
                                        console.log("9. DELETE KEY:", res.status);

                                        // 10. CLEAR (Entire current table)
                                        db.clear(function(err, res) {
                                            console.log("10. CLEAR TABLE:", res.status);

                                            // 11. DROP (Remove table entirely)
                                            db.drop('demo_table', function(err, res) {
                                                console.log("11. DROP TABLE:", res.status);

                                                console.log("\n✅ Demo Complete. Closing connection.");
                                                db.close();
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

var dbe = createTLiteClient(config, function() {
    dbe.use('logs', function(err, res) {
        dbe.set('entry_1', 'Server Start', function(err, res) {
            dbe.get('entry_1', function(err, res) {
                console.log(res.data.value);
            });
        });
    });
});

