<?php

/**
 * TLite Client API - Full Functional Implementation
 */
function create_tlite_client($host, $port, $certs) {
    // 1. Path Verification
    foreach ($certs as $key => $path) {
        if (!file_exists($path)) {
            throw new Exception("Missing Certificate File ($key): " . $path);
        }
    }

    // 2. SSL Context Configuration
    $context = stream_context_create([
        'ssl' => [
            'cafile'            => realpath($certs['ca']),
            'local_cert'        => realpath($certs['cert']),
            'local_pk'          => realpath($certs['key']),
            'verify_peer'       => true,
            'verify_peer_name'  => false, 
            'allow_self_signed' => true,
            'crypto_method'     => STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT
        ]
    ]);

    // 3. Establish Connection
    $remote = "tcp://$host:$port";
    $errno = 0; $errstr = "";
    $socket = stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);

    if (!$socket) {
        throw new Exception("TCP Connection failed: $errstr ($errno)");
    }

    // Upgrade to TLS
    stream_set_blocking($socket, true);
    if (stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT) !== true) {
        throw new Exception("TLS Handshake failed: Check certificate validity.");
    }

    /**
     * Internal JSON Protocol Handler
     */
    $request = function($cmd, $args = []) use ($socket) {
        $payload = json_encode(['cmd' => $cmd, 'args' => $args]) . "\n";
        if (fwrite($socket, $payload) === false) {
            throw new Exception("Failed to write to server.");
        }
        
        $response = fgets($socket);
        if ($response === false) {
            throw new Exception("Server closed the connection unexpectedly.");
        }
        return json_decode($response, true);
    };

    // --- FULL COMMAND SET ---
    return [
        // Table/Context Management
        'use'         => function($tableName) use ($request) { return $request('use', ['k' => $tableName]); },
        'drop'        => function($tableName) use ($request) { return $request('drop', ['k' => $tableName]); },
        'tables'      => function() use ($request) { return $request('tables'); },

        // Key-Value Operations
        'set'         => function($k, $v) use ($request) { 
            $val = (is_array($v) || is_object($v)) ? json_encode($v) : (string)$v;
            return $request('set', ['k' => $k, 'v' => $val]); 
        },
        'get'         => function($k) use ($request) { return $request('get', ['k' => $k]); },
        'delete'      => function($k) use ($request) { return $request('delete', ['k' => $k]); },
        'clear'       => function() use ($request) { return $request('clear'); },

        // Search and Retrieval
        'list'        => function($limit = null) use ($request) { return $request('list', $limit ? ['n' => (string)$limit] : []); },
        'next'        => function() use ($request) { return $request('next'); },
        'search'      => function($query) use ($request) { return $request('search', ['q' => $query]); },
        'searchKey'   => function($query) use ($request) { return $request('searchkey', ['q' => $query]); },
        'searchValue' => function($query) use ($request) { return $request('searchvalue', ['q' => $query]); },

        // Advanced / Admin
        'sql'         => function($query) use ($request) { return $request('sql', ['sql' => $query]); },
        'dump'        => function() use ($request) { return $request('dump'); },
        'init'        => function($data, $isFile = false) use ($request) { 
            return $request('init', $isFile ? ['f' => $data] : ['data' => json_encode($data)]); 
        },
        'close'       => function() use ($socket) { fclose($socket); }
    ];
}

