# keyvalue-jsondb
*`fast`, `secure`, `private`, and `memory leak resistant` `in-memory` `key-value` `(closure encapsulated)` `json based` `datastore or database` that supports `tcp mtls (tls)`, and a `command shell (without or with [todo] authentication)`*


##### indevelopment - do not use in production


please note: `redis-like` is an inference most of the shell commands are like redis but a few changes have been made to accomodate the architecture. 


#### FEATURES


- ✓ runs in ✓`tcp tls`, or ✒️`tcp mtls`, or `ws`, or `wss` (in development for tests)
- ✓ runs a `database or shell` mode with ✓`redis-like` commands (in development)
- ✓ has a nodejs client api.  
- any programming language that supports `tcp tls`, `tcp mtls` requests can be used as a client *[todo add request structure and parameters to docs]*


```
node index.js -h=localhost -p=7000 --mode server -dt=30m -log=app.log -cert=server.crt -key=server.key -ca-cert=ca.crt -l=store_dump.json
```

```
node index.js -h=localhost -p=7000 --mode shell -log=app.log -cert=client.crt -key=client.key -ca-cert=ca.crt  
```


### 🖥️ Server Mode Prefixes

The following command-line arguments are used when running the application in server mode (`-s server`):

| Prefix | Key | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `-ip`, `-h`, `--host` | `ip` | `127.0.0.1` | IP address for the server to bind to. |
| `-p`, `--port` | `port` | `9999` | TCP port the server listens on (Mandatory TLS). |
| `-s`, `--mode` | `mode` | `server` | Specifies the application mode (must be `server`). |
| `-c`, `--cert` | `cert` | `server.crt` | **Mandatory:** Path to the server's TLS certificate file. |
| `-k`, `--key` | `key` | `server.key` | **Mandatory:** Path to the server's private key file. |
| `-ca`, `--ca-cert` | `caCert` | `ca.crt` | **Mandatory:** Path to the Certificate Authority (CA) file used to verify client certificates (for mTLS). |
| `--dump-file` | `dumpFile` | `store_dump.json` | The file used for automatic in-memory store synchronization. |
| `--exit-dump-file` | `exitDumpFile` | *Same as `dumpFile`* | File used for the final dump upon graceful shutdown (SIGINT/SIGTERM). |
| `--dump-time`, `-dt` | `dumpTime` | `5m` | Time interval for dynamic data dumping (currently redundant due to synchronous write). |
| `--load-file` | `loadFile` | `null` | File to load data from *if* the `dumpFile` is not present on startup. |
| `--init-data` | `initData` | `null` | JSON string to initialize the store with upon startup. |

### 💻 Shell Client Mode Prefixes

The following command-line arguments are used when running the application in shell mode (`-s shell`):

| Prefix | Key | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `-ip`, `-h`, `--host` | `ip` | `127.0.0.1` | IP address of the server to connect to. |
| `-p`, `--port` | `port` | `9999` | TCP port of the server to connect to. |
| `-s`, `--mode` | `mode` | `server` | Specifies the application mode (must be `shell`). |
| `-ca`, `--ca-cert` | `caCert` | `ca.crt` | **Mandatory:** Path to the Certificate Authority (CA) file needed to validate the **server's** certificate. |
| `-c`, `--cert` | `cert` | `server.crt` | **Optional (for mTLS):** Path to the client's TLS certificate. |
| `-k`, `--key` | `key` | `server.key` | **Optional (for mTLS):** Path to the client's private key. |


todo: add all features


#### Running/ Usage


`node db.js ...flags...`


- `node db.js` *(default, starts shell)*

- `node db.js -s "db"` 


example:

- `node db.js -s "shell" -t "ws" -p "4567" -ip "127.0.0.1"`


example:

- `node db.js -s "shell" -t "http" -p "4567" -ip "127.0.0.1" -u "user_name" -pwd "password"`


- `node db.js -s "shell" -t "https" -p "4567" -ip "127.0.0.1" -k "./fldr/key"`



### Architecture of kvjsondb - Basic Storage
![DB Basic Storage](https://github.com/ganeshkbhat/keyvalue-jsondb/blob/main/docs/db-basic-storage.jpg)




### Shell Commands


| Command | Alias | Syntax | Description |
| :--- | :--- | :--- | :--- |
| `set` | `write` | `set <key> <value>` | Sets a single key with a string, number, or JSON value. **Note:** The value is everything after the key and first space. |
| `get` | `read` | `get <key>` | Retrieves and prints the value associated with the specified key. |
| `del` | `deletekey` | `del <key>` | Deletes the key-value pair from the store. |
| `has` | `hasKey` | `has <key>` | Checks if a key exists in the store (returns `true` or `false`). |
| `init` | | `init <JSON>` or `init -f <filename>` | **REPLACES** the entire store with the provided JSON object or the contents of a local file. |
| `update` | `load` | `update <JSON>` or `update -f <filename>` | **MERGES** the provided JSON object or file contents into the existing store. |
| `clear` | | `clear` | Clears the entire in-memory store (same as `init {}`). |
| `search` | | `search <criteria>` | Searches for the criteria in **Keys AND Values**. |
| `searchkeys` | | `searchkeys <criteria>` | Searches for the criteria in **Keys Only**. |
| `searchvalues` | | `searchvalues <criteria>` | Searches for the criteria in **Values Only**. |
| `dump` | | `dump` | Retrieves the entire store data and prints it to the shell console. |
| `dump` | | `dump -f <filename>` | Instructs the **server** to save the current store to the specified filename on the server's disk. |
| `lock` | | `lock` | Checks the status of the server's concurrency lock. |
| `setlock` | | `setlock <true/false>` | Manually sets the concurrency lock state. |
| `droplock` | | `droplock` | Unlocks the store and processes any waiting queued operations. |
| `help` | | `help` | Displays the help menu. |
| `exit` | `quit` | `exit` | Disconnects the shell client and quits. |



###### set
\> `set key value`

*example\>* `set test 10`


###### get
\> `get key`

*example\>* `get test`


###### has
\> `has key`

*example\>* `has test`


###### search
\> `search string`

*example\>* `search test`


###### search
\> `searchvalues string`

*example\>* `searchvalues 10`


###### search
\> `searchkeys string`

*example\>* `searchkeys test`


###### search
\> `search string`

*example\>* `search test`


###### load
\> `load -f filename`

*example\>* `load -f "./dump/filename.json"`


###### load
\> `load jsonobject`

*example\>* `load "{'test': 10}"`


###### read
\> `read key`

*example\>* `read test`


###### clear
\> `clear`

*example\>* `clear`


###### init
\> `init -f filename`

*example\>* `init -f "./dump/filename.json"`


###### init
\> `init jsonobject`

*example\>* `init "{'test': 10}"`


###### update
\> `update -f filename`

*example\>* `update -f "./dump/filename.json"`


###### update
\> `update jsonobject`

*example\>* `update "{"test": 10}"`


###### del
\> `del key`

*example\>* `del test`


###### dump
\> `dump -f "filename/within/quotes"`

*example\>* `dump -f "./dump/filename.json"`



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
