# keyvalue-db
*`fast`, `secure`, `private`, and `memory leak resistant` `in-memory` `key-value` `js-sqlite based` `datastore or database` that supports `tcp mtls (tls)`, and a `command shell (without or with [todo] authentication)`*


##### indevelopment - use in production with caution


please note: 
- `redis-like` is an inference most of the shell commands are like redis but a few changes have been made to accomodate the architecture. 
- you can run the index.js using the below commands or package it into a executable to run as a executable
- to run as executable run npm run build

#### FEATURES


- ✓ runs in ✓`tcp tls`, or ✓`tcp mtls`, or ✒️`ws`, or ✒️`wss` (in development for tests)
- ✓ runs a `database or shell` mode with ✓`redis-like` commands (in development)
- ✓ has a nodejs client api.  
- ✓ has a python client api.  
- ✒️ has a php client api.  
- ✒️ any programming language that supports `tcp tls`, `tcp mtls` requests can be used as a client *[todo add request structure and parameters to docs]*


-----------------------------------------------


[Watch the comprehensive video](https://youtu.be/_c99SPW4DBo?si=lXmtiYF8k8uMarRM)


-----------------------------------------------


# Server Database Documentation


### 🖥️ Server Mode Prefixes

The following command-line arguments are used when running the application in server mode (`-s db`):

TLite is a lightweight, TLS-encrypted, in-memory SQLite database system designed for speed and security. It features periodic disk persistence, robust search modes, and a dynamic interactive shell.

---

### 1. Server Startup Prefixes 

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
| `-s`, `--mode` |  `--mode db` will start in database mode | `shell` |
| `-lp`, `--log-prefix` | the logger file path. logger follows the structure: `[Timestamp] [Remote_IP] [Command] [Status] "Message"` | `--dump-file` or working directory |


**Example Command:**
```bash
node index.js --mode db -h localhost -p 8000 -dt 5m --dump-file data.sqlite --cert "./certs/server.crt" --key "./certs/server.key" --ca-cert "./certs/ca.crt"
```


### 💻 Shell Client Mode Prefixes

The following command-line arguments are used when running the application in shell mode (`-s shell`):

### 2. Client Startup Prefixes 

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

-----------------------------------------------


### Architecture of kvdb - Basic Storage
![DB Basic Storage](https://github.com/ganeshkbhat/keyvalue-jsondb/blob/main/docs/db-basic-storage.jpg)


-----------------------------------------------


##### How Synchronization (Dumping) Happens

The script implements exactly the three triggers you requested:

- Interval-based Sync: The setInterval function runs a VACUUM INTO command every $X$ seconds (defined by the -dt flag). This creates a consistent snapshot of the memory state into the disk file without locking the database for users.
- Graceful Exit Sync: The handleShutdown function captures SIGINT (Ctrl+C) and SIGTERM. It executes a final synchronous dump to the disk file before the process terminates.
- Crash Recovery Sync: The uncaughtException listener acts as a safety net. If the Node.js process encounters a fatal error, it attempts one last emergency dump to prevent data loss.


-----------------------------------------------


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
| `use` |  | `use <tablename>` | use the context of which table/ database is being used for key-value store. Switches the active operational table destination context. If the requested target table doesn't exist, it will be automatically provisioned inside the volatile store and mirrored to disk |
| `drop` |  | `drop <tablename>` | drop the context of which table/ database is being mentioned. tables are given a context of key-value database. Deletes an entire custom table schema along with all contained transactional keys. |
| `register` |  | `register <username> <password> -f <email> [-db <resource_table>] [-resource <resource_key>] [-permissions <perm_string>]` | Registers a new user. You can also pass advanced optional flag parameters to provision structural object scopes immediately upon registration |
| `login` |  | `login <username> <password>` | Logs in a new user into the shell. |
| `passwd` |  | `passwd newpassword` | Changes the logged in user password. |
| `logout` |  | `logout` | Logs out the logged in user in the shell. |
| `exit` | `quit` | `exit` | Disconnects the shell client and quits. |
| `help` | | `help` | Displays the help menu. |


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


1. Authentication Commands

These commands are used to verify a user's identity and manage active sessions.

\> `register <username>`

Purpose: Creates a new user account with a secure, hashed password.

Usage: Type register followed by the username. The client shell will then securely prompt you to type your email and password interactively.

\> `login <username>`

Purpose: Authenticates a user and binds a secure session token to the current terminal connection.

Usage: Type login followed by your username. The shell will prompt you interactively for your password.

\> `logout`

Purpose: Destroys the active session token and clears authentication state from the socket.

Usage: Type logout directly into the shell.

-----------------------------

2. Authorization & ACL Commands

These commands manage what an authenticated user or group is allowed to do. They require explicit flags to pass validation.

\> `grant user -pt <user|group> -pr <name> -r <key|*> -perm <privileges>`

Purpose: Grants specific CRUD permissions to a target user or group.

Flags:

-pt (Principal Type): Must be user or group.

-pr (Principal Name): The specific username or group name.

-r (Resource): Use a specific key name (e.g., gb) or use * as a wildcard to grant access to the entire table.

-perm (Permissions): A comma-separated list of capabilities: read, create, update, delete.

\> `revoke user -pt <user|group> -pr <name> -r <key|*>`

Purpose: Completely removes an access control policy matching a specific principal and resource combination.

\> `acl`

Purpose: Views the active access control policies for debugging or verification.

Optional Flags: You can filter the policy lists by appending -principal <name>, -principal_type <user|group>, or -resource <key>.

-----------------------------

3. Group Administration Commands

Because users inherit permissions from any group they belong to, you can manage group memberships using these commands:

\> `groupadd <group_name> <description>`

Purpose: Registers a new group role/bucket inside the system.

\> `groupassign <username> <group_name>`

Purpose: Adds a user to a group so they inherit that group's permissions.

\> `groupremove <username> <group_name>`

Purpose: Strips a user of a group assignment, removing their inherited permissions.

\> `listgroups`

Purpose: Displays all created groups, their descriptions, and status entries.


#### TODO

add docs for other features
