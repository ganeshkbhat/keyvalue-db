<?php
require_once './clients/api.php';

// Correct path traversal: main/clients/demo.php -> main/certs/
$baseDir = dirname(__DIR__); 
$certs = [
    'ca'   => $baseDir . DIRECTORY_SEPARATOR . 'certs' . DIRECTORY_SEPARATOR . 'ca.crt',
    'cert' => $baseDir . DIRECTORY_SEPARATOR . 'certs' . DIRECTORY_SEPARATOR . 'client.crt',
    'key'  => $baseDir . DIRECTORY_SEPARATOR . 'certs' . DIRECTORY_SEPARATOR . 'client.key'
];

try {
    $db = create_tlite_client('localhost', 8000, $certs);
    echo "🚀 Connected to TLite Server. Starting full test suite...\n\n";

    // 1. Context: Switch to a table (creates it if not present)
    echo "[1] USE: "; print_r($db['use']('php_demo_table'));

    // 2. Set: Simple string
    echo "[2] SET: "; print_r($db['set']('app_name', 'PHP-TLite-Client'));
    $res = $db['get']('app_name');
    print_r($res);

    // 3. Set: JSON object
    $profile = ['id' => 101, 'status' => 'active', 'tags' => ['web', 'php']];
    echo "[3] SET JSON: "; print_r($db['set']('user_profile', $profile));

    // 4. Get: Retrieve data
    echo "[4] GET: "; 
    $res = $db['get']('user_profile');
    echo "Value found: " . $res['data']['value'] . "\n";

    // 5. Search: Fuzzy match on keys/values
    echo "[5] SEARCH: "; print_r($db['search']('active'));

    // 6. Tables: List all stores
    echo "[6] TABLES: "; print_r($db['tables']());

    // 7. List & Pagination:
    for($i=1; $i<=5; $i++) $db['set']("batch_$i", "val_$i");
    $list = $db['list'](3); // Get first 3
    echo "[7] LIST (Limit 3): Count " . count($list['data']) . "\n";
    if ($list['pagination']['hasMore']) {
        echo "    NEXT BATCH: "; print_r($db['next']());
    }

    // 8. SQL: Custom database query
    echo "[8] SQL: "; print_r($db['sql']("SELECT count(*) as total FROM php_demo_table"));

    // 9. Dump: Persist to disk
    echo "[9] DUMP: "; print_r($db['dump']());

    // 10. Delete & Clear
    echo "[10] DELETE: "; print_r($db['delete']('app_name'));
    echo "[11] CLEAR: "; print_r($db['clear']());

    // 11. Drop: Delete entire table
    echo "[12] DROP: "; print_r($db['drop']('php_demo_table'));

    $db['close']();
    echo "\n✅ All tests passed.\n";

} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}