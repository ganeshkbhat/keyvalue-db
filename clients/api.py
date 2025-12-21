import socket
import ssl
import json

def kvdb_client(host, port, ca_cert, client_cert, client_key):
    """
    kvdb_client Client API - Python Implementation
    """
    # Initialize context with TLS_CLIENT protocol to avoid strict extension errors
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.load_verify_locations(ca_cert)
    context.load_cert_chain(certfile=client_cert, keyfile=client_key)
    context.check_hostname = False 
    context.verify_mode = ssl.CERT_REQUIRED

    raw_sock = socket.create_connection((host, port))
    conn = context.wrap_socket(raw_sock, server_hostname=host)

    def send_request(cmd, args=None):
        payload = json.dumps({"cmd": cmd, "args": args or {}}) + "\n"
        conn.sendall(payload.encode('utf-8'))
        
        # Read until newline character
        response_data = b""
        while True:
            chunk = conn.recv(1)
            if not chunk or chunk == b"\n":
                break
            response_data += chunk
        
        return json.loads(response_data.decode('utf-8'))

    # Return function map
    return {
        "use": lambda k: send_request('use', {'k': k}),
        "drop": lambda k: send_request('drop', {'k': k}),
        "set": lambda k, v: send_request('set', {'k': k, 'v': json.dumps(v) if isinstance(v, (dict, list)) else str(v)}),
        "get": lambda k: send_request('get', {'k': k}),
        "delete": lambda k: send_request('delete', {'k': k}),
        "clear": lambda: send_request('clear'),
        "tables": lambda: send_request('tables'),
        "list": lambda n=None: send_request('list', {'n': str(n)} if n else {}),
        "next": lambda: send_request('next'),
        "search": lambda q: send_request('search', {'q': q}),
        "search_key": lambda q: send_request('searchkey', {'q': q}),
        "search_value": lambda q: send_request('searchvalue', {'q': q}),
        "sql": lambda s: send_request('sql', {'sql': s}),
        "dump": lambda: send_request('dump'),
        "close": lambda: conn.close()
    }


