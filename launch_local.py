"""Start an owned loopback HTTP server and open both dashboards."""
import os
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    server = None
    for port in range(8000, 8011):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            continue
    if server is None:
        raise RuntimeError('Ports 8000-8010 are unavailable. Close an old server and retry.')
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    print(f'Serving {root}\n{base}\nClose this window or press Ctrl+C to stop.', flush=True)
    if '--no-browser' not in os.sys.argv:
        for page in ('final_map.html', 'time_analysis.html'):
            webbrowser.open(f'{base}/{page}', new=2)
    try:
        while thread.is_alive():
            thread.join(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
