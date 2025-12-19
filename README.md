# keyvalue-db
*`fast`, `secure`, `private`, and `memory leak resistant` `in-memory` `key-value` `js-sqlite based` `datastore or database` that supports `tcp mtls (tls)`, and a `command shell (without or with [todo] authentication)`*


##### indevelopment - do not use in production


please note: `redis-like` is an inference most of the shell commands are like redis but a few changes have been made to accomodate the architecture. 


#### FEATURES


- ✓ runs in ✓`tcp tls`, or ✒️`tcp mtls`, or `ws`, or `wss` (in development for tests)
- ✓ runs a `database or shell` mode with ✓`redis-like` commands (in development)
- ✒️ has a nodejs client api.  
- ✒️ any programming language that supports `tcp tls`, `tcp mtls` requests can be used as a client *[todo add request structure and parameters to docs]*


### 🖥️ Server Mode Prefixes

The following command-line arguments are used when running the application in server mode (`-s server`):

# Server Database Documentation

TLite is a lightweight, TLS-encrypted, in-memory SQLite database system designed for speed and security. It features periodic disk persistence, robust search modes, and a dynamic interactive shell.

---

## 1. Server Startup Prefixes 

The server manages the database state in memory and handles periodic synchronization to the disk.

| Prefix | Description | Default |
| :--- | :--- | :--- |
| `-p`, `--port` | Port to listen on. | `9999` |
| `-ip`, `-h` | IP address to bind to. | `127.0.0.1` |
| `-dt` | Persistence interval (e.g., `10s`, `1m`, `1h2m`). | `60s` |
| `--dump-file` | **Primary** file for startup load and periodic saving. needed for final graceful shutdown. | None |
| `-l`, `--load` | **Secondary** file (used if `--dump-file` is missing). | `data.sqlite` |
| `-ca` | Path to CA certificate. | `ca.crt` |
| `-c`, `--cert` | Path to Server certificate. | `server.crt` |
| `-k`, `--key` | Path to Server private key. | `server.key` |
| `--mode`, `-s` |  `--mode db` will start in database mode | `shell` |

**Example Command:**
```bash
node index.js --mode db -h localhost -p 8000 -dt 5m --dump-file data.sqlite --cert "./certs/server.crt" --key "./certs/server.key" --ca-cert "./certs/ca.crt"
```


### 💻 Shell Client Mode Prefixes

The following command-line arguments are used when running the application in shell mode (`-s shell`):

## 2. Client Startup Prefixes 

The client provides a secure interactive shell. The prompt is dynamically generated only after a successful connection to ensure the displayed port is accurate: `user@host:port>`.

| Prefix | Description | Default |
| :--- | :--- | :--- |
| `-p`, `--port` | The port the server is listening on. | `9999` |
| `-ip`, `-h` | The server's IP address or hostname. | `127.0.0.1` |
| `-ca` | Path to the CA certificate for server verification. | `ca.crt` |
| `-c` | Path to the Client certificate for authentication. | `client.crt` |
| `-k` | Path to the Client private key. | `client.key` |
| `--mode` , `-s` | will start in database shell mode | `--mode shell` | 


**Startup Example:**
```bash
node index.js --mode shell -h localhost -p 8000 --cert "./certs/client.crt" --key "./certs/client.key" --ca-cert "./certs/ca.crt"
```

<iframe width="560" height="315" src=www.youtube.com/watch?v=_c99SPW4DBo" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>



todo: add all features



### Architecture of kvjsondb - Basic Storage
![DB Basic Storage](https://github.com/ganeshkbhat/keyvalue-jsondb/blob/main/docs/db-basic-storage.jpg)




### Shell Commands


| Command | Alias | Syntax | Description |
| :--- | :--- | :--- | :--- |
| `set` | `write` | `set <key> <value>` | Sets a single key with a string, number, or JSON value. **Note:** The value is everything after the key and first space. |
| `get` | `read` | `get <key>` | Retrieves and prints the value associated with the specified key. |
| `del` | `deletekey` | `del <key>` | Deletes the key-value pair from the store. |
| `has` | `hasKey` | `has <key>` | Checks if a key exists in the store (returns `true` or `false`). |
| `init` | | `init -cmd <JSON String>` or `init -f <filename>` | **REPLACES** the entire store with the provided JSON object or the contents of a local file. |
| `load` | `load` | `load -f <JSON>` or `load -f <filename>` | **MERGES** the provided JSON object or file contents into the existing store. |
| `clear` | | `clear` | Clears the entire in-memory store (same as `init {}`). Use with caution. |
| `search` | | `search <criteria>` | Searches for the criteria in **Keys AND Values**. |
| `searchkey` | | `searchkey <criteria>` | Searches for the criteria in **Keys Only**. |
| `searchvalue` | | `searchvalue <criteria>` | Searches for the criteria in **Values Only**. |
| `dump` | | `dump` | Retrieves the entire store data and prints it to the shell console. |
| `dump` | | `dump -f <filename>` | Instructs the **server** to save the current store to the specified filename on the server's disk. |
| `list` | | `list -n <count>` | Lists all records in the current table. Use -n to enable pagination (e.g., list -n 10). Action: Press ENTER at the pagination prompt to load the next batch. |
| `sql` | | `sql -cmd <sql command>` | Executes raw SQL against the in-memory database. Use backticks for the query |
| `help` | | `help` | Displays the help menu. |
| `use` |  | `use <tablename>` | use the context of whih table/ database is being used for key-value store |
| `exit` | `quit` | `exit` | Disconnects the shell client and quits. |


-----------------------------

###### set
\> `set <key> <value>`

*example\>* `set testvalue`

*example\>* `set test 10`


###### get
\> `get <key>`

*example\>* `get test`


###### del
\> `del <key>`

*example\>* `del test`


###### has
\> `has <key>`

*example\>* `has test`


###### search
\> `search <string>`

*example\>* `search test`


###### search
\> `searchvalues <string>`

*example\>* `searchvalues 10`


###### search
\> `searchkeys <string>`

*example\>* `searchkeys test`


###### search
\> `search <string>`

*example\>* `search test`


###### load
\> `load -f <filename>`

*example\>* `load -f "./dump/filename.json"`


###### load
\> `load <jsonobject>`

*example\>* `load "{'test': 10}"`


###### read
\> `read <key>`

*example\>* `read test`


###### clear
\> `clear`

*example\>* `clear`


###### init
\> `init -f <filename>`

*example\>* `init -f "./dump/filename.json"`


###### init
\> `init <jsonobject>`

*example\>* `init "{'test': 10}"`


###### update
\> `update -f <filename>`

*example\>* `update -f "./dump/filename.json"`


###### update
\> `update <jsonobject>`

*example\>* `update "{"test": 10}"`


###### del
\> `del <key>`

*example\>* `del test`


###### dump
\> `dump -f "<filename/within/quotes>"`

*example\>* `dump -f "./dump/filename.json"`

-----------------------------

<!-- 

### Client API - node.js


```

var client = new ClientAPI(ipURL, options, type = "http")
// type options: `http`, `https`, `ws`, `wss`

// nodejs http request options/ options: { host, port, headers, path, method, ... }

// // msg/ message = { event, query, options }
// // msg/ message = { event, query = { key, value }, options }
// // msg/ message = { event, query, options, type }
// // msg/ message = { event, query, options, type, filename } // dumpToFile, dumpKeysToFile

client.hasKey(msg, opts)
client.getKey(msg, opts)
client.setKey(msg, opts)
client.updateKey(msg, opts)
client.delKey(msg, opts)
client.read(msg, opts)
client.dump(msg, opts)
client.dumpToFile(msg, opts)
client.dumpKeys(msg, opts)
client.dumpKeysToFile(msg, opts)
client.init(msg, opts)
client.clear(msg, opts)
client.load(msg, opts)
client.search(msg, opts)
client.searchValue(msg, opts)
client.searchKey(msg, opts)
client.searchKeyValue(msg, opts)

```


### <a name="messagestructure">Client API - Request Structures</a> 

*[**headers** `http/https`]*, 
*[**body** for `http/https post` or `ws/wss message`]*



*event*: `hasKey`

##### headers


##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `getKey`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `setKey`

##### headers

##### body

{ event, query = { key, value }, options }

{ event, query = { key, value }, options, type }

*example:*

{ event : , query : { key : , value :  }, options :  }

{ event : , query : { key : , value :  }, options : , type :  }


*event*: `updateKey`

##### headers

##### body

{ event, query = { key, value }, options }

{ event, query = { key, value }, options, type }

*example:*

{ event : , query : { key : , value : }, options :  }

{ event : , query : { key : , value : }, options : , type :  }


*event*: `delKey`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `read`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `dump`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `dumpToFile`

##### headers

##### body

{ event, query, options, type, filename }

{ event, query, options, type, filename }

*example:*

{ event : , query : , options : , type : , filename :  }

{ event : , query : , options : , type : , filename :  }


*event*: `dumpKeys`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `dumpKeysToFile`

##### headers

##### body

{ event, query, options, type, filename }

{ event, query, options, type, filename }

*example:*

{ event : , query : , options : , type : , filename :  }

{ event : , query : , options : , type : , filename :  }


*event*: `init`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `clear`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `load`

##### headers

##### body

{ event, query, options, type, filename }

{ event, query, options, type, filename }

*example:*

{ event : , query : , options : , type : , filename :  }

{ event : , query : , options : , type : , filename :  }


*event*: `search`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `searchValue`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `searchKey`

##### headers

##### body

{ event, query, options }

{ event, query, options, type }

*example:*

{ event : , query : , options :  }

{ event : , query : , options : , type :  }


*event*: `searchKeyValue`

##### headers

##### body

{ event, query = { key, value }, options  }

{ event, query = { key, value }, options, type }

*example:*

{ event : , query : { key : , value : }, options :  }

{ event : , query : { key : , value : }, options : , type :  }
 -->



### Security Checks and Consideration

there are possibilities for system hacks if `someDataProcessorFunction(d)` (the function that processes the data sent back from the database) processes the data from your JSON file in an unsafe manner

- Unsanitized String Interpretation 
  - issues due to Unsanitized strings especially when using using `eval()`, `child_process.exec()` with user-provided input, or similar mechanisms. 
  - this is similar to classic SQL injection vulnerability, but for code execution. 
  - Never `eval()` or `child_process.exec()` or Dynamically Execute Unsanitized String Data
  - Recommendation: Strict Input Validation and Sanitization
    - Binary Data Handling 
      - uses the binary data to construct system commands or file paths without proper validation, it could be exploited 
      - preferably, sanitize by converting to utf-8 text
      - in case of executable binary, it should not impact as much unless the data is written to a file and the file used as an executable to execute the executable
      - in case of image or video like binaries please 
    - Data stored as code: 
      - Principle of Least Privilege: 
        - Ensure the Node.js process running your application has the minimum necessary permissions to perform its tasks. 
        - This limits the damage an attacker can do even if they manage to execute some code


<!-- 

1. jsondb server (http, https, ws, wss)
2. jsondb client (http, https, ws, wss)

-->

<!-- 

3. jsondb shell (http, https, ws, wss)

-->

#### TODO

add docs for other features
