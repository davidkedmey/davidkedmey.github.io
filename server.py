#!/usr/bin/env python3
"""Dev server: static files + POST /api/wish + POST /api/llm proxy."""

import http.server
import json
import os
import urllib.request
import urllib.error
from datetime import datetime

PORT = 8765
WISHLIST_PATH = os.path.join(os.path.dirname(__file__), '.local', 'scribe', 'wishlist.md')

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/wish':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            inp = body.get('input', '').strip()
            suggestion = body.get('suggestion', '').strip()
            if inp and suggestion:
                os.makedirs(os.path.dirname(WISHLIST_PATH), exist_ok=True)
                with open(WISHLIST_PATH, 'a') as f:
                    ts = datetime.now().strftime('%Y-%m-%d %H:%M')
                    f.write(f'- **{ts}** — "{inp}" → {suggestion}\n')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
                print(f'  WISH: "{inp}" → {suggestion}')
            else:
                self.send_response(400)
                self.end_headers()
        elif self.path == '/api/llm':
            # Proxy LLM requests to avoid CORS issues
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            req_data = json.loads(body)
            api_key = req_data.pop('apiKey', '')
            base_url = req_data.pop('baseUrl', 'https://api.openai.com/v1')
            url = f'{base_url}/chat/completions'
            req = urllib.request.Request(url, data=json.dumps(req_data).encode(),
                headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'})
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    result = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(result)
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(__file__) or '.')
    with http.server.HTTPServer(('', PORT), Handler) as s:
        print(f'Serving on http://localhost:{PORT}')
        s.serve_forever()
