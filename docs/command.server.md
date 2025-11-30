# keyvalue-jsondb
*`fast`, `secure`, `private`, and `memory leak resistant` `in-memory` `key-value` `(closure encapsulated)` `json based` `datastore or database` that supports `http`, `https`, `ws`, `wss`, and a `command shell (without or with [todo] authentication)` and is `extendible with expressjs middlewares`*


##### indevelopment - do not use in production


please note: `redis-like` is an inference most of the shell commands are like redis but a few changes have been made to accomodate the architecture. 


- <a name="rundb">Running the Database Server</a>
  - <a name="rundbdefaults">with defaults</a>
  - <a name="rundbnouserpass">with no username/password</a>
  - <a name="rundbuserpass">with username/password</a>
  - <a name="rundbwithoutkeys">without keys</a>
  - <a name="rundbwithkeys">with keys</a>


#### Running/ Usage


`node db.js ...flags...`


- `node db.js` *(default, starts shell)*

- `node db.js -s "db"` *(starts database server)* 



##### ...flags...


`prefix: "-p" port [default: 4567]`

`prefix: "-t", server protocol [default: ws, will enable http and ws]`

`type options: (a) http, (b) https, (c) ws, (d) wss` (consider enabling all protocols)

`prefix: "-ip", ip address [default: 127.0.0.1]`

`prefix: "-k", key path [default: none, will enable http or ws]`

`prefix: "-c", certificate path [default: none, will enable use http or ws]`

`prefix: "-u", user [default: blank]`

`prefix: "-pwd", password [default: blank]`

`prefix: "-s", db server or shell [default: shell]`


##### defaults

- `shell` (`-s`) options: `shell`, `db` [*default: `shell`*]
- `type` (`-t`) options: `http`, `https`, `ws`, `wss` [*default: `ws`*]
- `port` (`-p`) options: [default: `4567` or provided `custom port`]
- `ip` (`-ip`) options: [default: `127.0.0.1` / `192.168.1.1`] or provided `custom ip address`
- `key` (`-k`)/ `cert` (`-c`) options: [default: `generate` `public and private key pair` for db server] 


#### Server Running/ Usage - kvjsondb


##### run database server with [a] defaults


- `node db.js -s "db"`



##### run database server with [b] with no username/password


- `node db.js -s "db"`

- `node db.js -s "db" -t "type"`

- `node db.js -s "db" -p "port"`

- `node db.js -s "db" -ip "ip"`

- `node db.js -s "db" -t "type" -p "port"`

- `node db.js -s "db" -t "type" -ip "ip"`

- `node db.js -s "db" -ip "ip" -p "port"`

- `node db.js -s "db" -t "type" -p "port" -ip "ip"`

example: 

- `node db.js -s "db" -t "http" -p "4567" -ip "127.0.0.1"`



##### run database server with [c] with username/password


- `node db.js -s "db" -u "user" -pwd "pass"`

- `node db.js -s "db" -t "type" -u "user" -pwd "pass"`

- `node db.js -s "db" -t "type" -p "port" -u "user" -pwd "pass"`

- `node db.js -s "db" -t "type" -p "port" -ip "ip" -u "user" -pwd "pass"`

example: 

- `node db.js -s "db" -t "https" -p "4567" -ip "127.0.0.1" -u "user_name" -pwd "password"`



##### run database server with [d] without keys


- `node db.js -s "db"`

- `node db.js -s "db" -t "type"`

- `node db.js -s "db" -p "port"`

- `node db.js -s "db" -ip "ip"`

- `node db.js -s "db" -t "type" -p "port"`

- `node db.js -s "db" -t "type" -ip "ip"`

- `node db.js -s "db" -p "port" -ip "ip"`

- `node db.js -s "db" -t "type" -p "port" -ip "ip"`

example: 

- `node db.js -s "db" -t "ws" -p "4567" -ip "127.0.0.1"`



##### run database server with [e] with keys

`type` options are always `https` or `wss`

- `node db.js -s "db" -t "https"` (considering default as generate keys for db server)

- `node db.js -s "db" -t "wss"` (considering default as generate keys for db server)

- `node db.js -s "db" -k "./fldr/key" -c "./fldr/cert.crt"`

- `node db.js -s "db" -t "type" -k "./fldr/key" -c "./fldr/cert.crt"`

- `node db.js -s "db" -p "port" -k "./fldr/key" -c "./fldr/cert.crt"`

- `node db.js -s "db" -ip "ip" -k "./fldr/key" -c "./fldr/cert.crt"`

- `node db.js -s "db" -t "type" -p "port" -k "./fldr/key" -c "./fldr/cert.crt"`

- `node db.js -s "db" -t "type" -ip "ip" -k "./fldr/key" -c "./fldr/cert.crt"`

- `node db.js -s "db" -p "port" -ip "ip" -k "./fldr/key" -c "./fldr/cert.crt"`

- `node db.js -s "db" -t "type" -p "port" -ip "ip" -k "./fldr/key" -c "./fldr/cert.crt"`

example: 

- `node db.js -s "db" -t "wss" -p "4567" -ip "127.0.0.1" -k "./fldr/key" -c "./fldr/cert.crt"`



#### TODO

add docs for other features
