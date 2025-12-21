import socket
import ssl
import json
from clients.api import kvdb_client

# # --- DEMO EXECUTION ---


if __name__ == "__main__":
    # Config - Ensure these files exist in your path
    CONFIG = {
        "host": "localhost",
        "port": 9999,
        "ca": "./certs/ca.crt",
        "cert": "./certs/client.crt",
        "key": "./certs/client.key"
    }

    try:
        db = kvdb_client(CONFIG['host'], CONFIG['port'], CONFIG['ca'], CONFIG['cert'], CONFIG['key'])
        print("🚀 Connected to TLite Server (Python). Starting Demo...\n")

        # 1. Table Context
        print("1. USE TABLE:", db['use']('py_demo_table'))

        # 2. Set String
        print("2. SET STRING:", db['set']('app_name', 'TLite-Python'))

        # 3. Set Complex Data (Dictionary)
        config_data = {"version": "2.0.1", "features": ["tls", "sqlite", "memory"]}
        print("3. SET DICT:", db['set']('config', config_data))

        # 4. Get Data
        res = db['get']('config')
        print("4. GET CONFIG:", res['data']['value'] if res['status'] == 'success' else 'Failed')

        # 5. Search
        print("5. SEARCH 'sqlite':", db['search']('sqlite'))

        # 6. List with Pagination
        # Let's insert some dummy items first
        for i in range(5):
            db['set'](f'item_{i}', f'val_{i}')
        
        list_res = db['list'](3) # Get first 3
        print("6. LIST (Batch 1):", list_res['data'])
        
        if list_res.get('pagination', {}).get('hasMore'):
            print("   LIST (Batch 2):", db['next']()['data'])

        # 7. Tables
        print("7. ALL TABLES:", db['tables']())

        # 8. Raw SQL
        print("8. SQL QUERY:", db['sql']("SELECT count(*) as total FROM py_demo_table"))

        # 9. Dump (Persist)
        print("9. DUMP TO DISK:", db['dump']())

        # 10. Cleanup
        print("10. DELETE KEY:", db['delete']('app_name'))
        print("11. CLEAR TABLE:", db['clear']())
        print("12. DROP TABLE:", db['drop']('py_demo_table'))

        db['close']()
        print("\n✅ Python Demo Complete.")

    except Exception as e:
        print(f"❌ Demo Error: {e}")