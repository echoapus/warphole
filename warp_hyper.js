/*
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  WARP Endpoint IP Optimizer — Surge 4 Script
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  How it works:
 *    Sends HTTP requests to Cloudflare WARP endpoint IP ranges
 *    and measures latency via TCP handshake connection time.
 *    Since WARP WireGuard endpoints share the same Cloudflare
 *    Anycast IPs as the HTTP service, TCP latency correlates
 *    closely with UDP latency.
 *
 *  Environment: Surge 4+ (iOS / macOS)
 *  Script type: generic (panel trigger)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// ── Constants ─────────────────────────────────────────────

const WARP_PORT = 2408;
const STORE_KEY = "warp_yxip_results";

const IPV4_RANGES = [
    "162.159.192", "162.159.193",
    "162.159.195", "162.159.204",
    "188.114.96",  "188.114.97",
    "188.114.98",  "188.114.99",
];

const IPV6_RANGES = [
    "2606:4700:d0::", "2606:4700:d1::",
];

// ── Parse Arguments ───────────────────────────────────────

function parseArgs() {
    const defaults = {
        ipv6: false,
        sample: 15,
        timeout: 3,
        concurrency: 10,
    };

    if (typeof $argument === "undefined" || !$argument) return defaults;

    try {
        const pairs = $argument.split("&");
        for (const pair of pairs) {
            const [key, val] = pair.split("=");
            if (key === "ipv6") defaults.ipv6 = val === "true";
            else if (key === "sample") defaults.sample = parseInt(val, 10) || defaults.sample;
            else if (key === "timeout") defaults.timeout = parseInt(val, 10) || defaults.timeout;
            else if (key === "concurrency") defaults.concurrency = parseInt(val, 10) || defaults.concurrency;
        }
    } catch (e) {
        console.log(`[WARP] Failed to parse arguments: ${e.message}`);
    }

    return defaults;
}

// ── IP Generation ─────────────────────────────────────────

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateIPv4(sample) {
    const ips = [];
    for (const range of IPV4_RANGES) {
        const used = new Set();
        for (let i = 0; i < sample && used.size < 254; i++) {
            let last;
            do {
                last = randomInt(1, 254);
            } while (used.has(last));
            used.add(last);
            ips.push(`${range}.${last}`);
        }
    }
    return shuffle(ips);
}

function generateIPv6(sample) {
    const ips = [];
    for (const prefix of IPV6_RANGES) {
        for (let i = 0; i < sample; i++) {
            const suffix = randomInt(1, 0xFFFF).toString(16);
            ips.push(`${prefix}${suffix}`);
        }
    }
    return shuffle(ips);
}

// ── Single IP Test ────────────────────────────────────────

function testEndpoint(ip, timeout) {
    return new Promise((resolve) => {
        const start = Date.now();
        const isV6 = ip.includes(":");
        const host = isV6 ? `[${ip}]` : ip;

        $httpClient.head(
            {
                url: `http://${host}/cdn-cgi/trace`,
                timeout: timeout,
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    Connection: "close",
                },
            },
            (error, response, _data) => {
                const elapsed = Date.now() - start;
                const timeoutMs = timeout * 1000;

                if (error) {
                    // If elapsed time is close to timeout, treat as unreachable
                    if (elapsed >= timeoutMs - 200) {
                        resolve({ ip, port: WARP_PORT, latency: null, status: "timeout" });
                    } else {
                        // Connection refused/reset — still reflects real RTT
                        resolve({ ip, port: WARP_PORT, latency: elapsed, status: "refused" });
                    }
                } else {
                    resolve({
                        ip,
                        port: WARP_PORT,
                        latency: elapsed,
                        status: response.status || 200,
                    });
                }
            }
        );
    });
}

// ── Concurrency Control ───────────────────────────────────

async function runWithConcurrency(tasks, concurrency) {
    const results = [];
    const executing = new Set();

    for (const task of tasks) {
        const p = task().then((result) => {
            executing.delete(p);
            return result;
        });
        executing.add(p);
        results.push(p);

        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }

    return Promise.all(results);
}

// ── Format Output ─────────────────────────────────────────

function formatResults(valid, total, ipv6) {
    const topN = valid.slice(0, 10);
    const best = topN[0];

    const lines = topN.map(
        (r, i) => `${i + 1}. ${r.ip}:${r.port}  ${r.latency}ms`
    );

    const header = `🏆 Best: ${best.ip}:${best.port} (${best.latency}ms)`;
    const stats = `📊 Tested ${total}${ipv6 ? " IPv6" : ""} | Valid ${valid.length}`;
    const time = `🕐 ${new Date().toISOString().replace("T", " ").slice(0, 19)}`;

    return {
        panelTitle: "WARP Optimizer",
        panelContent: `${header}\n${stats}\n${time}`,
        fullList: lines.join("\n"),
        bestEndpoint: `${best.ip}:${best.port}`,
        bestLatency: best.latency,
    };
}

// ── Main ──────────────────────────────────────────────────

(async () => {
    const config = parseArgs();
    const startTime = Date.now();

    console.log(`[WARP] Starting test — IPv${config.ipv6 ? "6" : "4"}, sample=${config.sample}, concurrency=${config.concurrency}`);

    try {
        // 1. Generate candidate IPs
        const ips = config.ipv6
            ? generateIPv6(config.sample)
            : generateIPv4(config.sample);

        console.log(`[WARP] ${ips.length} candidate IPs`);

        // 2. Run tests concurrently
        const tasks = ips.map((ip) => () => testEndpoint(ip, config.timeout));
        const results = await runWithConcurrency(tasks, config.concurrency);

        // 3. Filter valid results and sort by latency
        const valid = results
            .filter((r) => r.latency !== null && r.latency > 0)
            .sort((a, b) => a.latency - b.latency);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[WARP] Done in ${elapsed}s, valid ${valid.length}/${results.length}`);

        // 4. No valid results
        if (valid.length === 0) {
            $notification.post("WARP Optimizer", "❌ Test Failed", "No reachable endpoints found. Please check your network and try again.");
            $done({
                title: "WARP Optimizer",
                content: "❌ No reachable endpoints\nPlease check your network and try again",
                icon: "xmark.circle.fill",
                "icon-color": "#FF3B30",
            });
            return;
        }

        // 5. Format results
        const output = formatResults(valid, ips.length, config.ipv6);

        // 6. Persist results
        const storedData = {
            best: output.bestEndpoint,
            latency: output.bestLatency,
            top10: valid.slice(0, 10).map((r) => ({
                endpoint: `${r.ip}:${r.port}`,
                latency: r.latency,
            })),
            testedAt: new Date().toISOString(),
            totalTested: ips.length,
            validCount: valid.length,
            elapsed: `${elapsed}s`,
        };
        $persistentStore.write(JSON.stringify(storedData), STORE_KEY);

        // 7. Push notification (with full Top 10)
        $notification.post(
            "WARP Optimizer ✅",
            `Best: ${output.bestEndpoint} (${output.bestLatency}ms)`,
            `${output.fullList}\n\nElapsed: ${elapsed}s | Replace your WireGuard Endpoint with the best IP above`
        );

        // 8. Update panel
        $done({
            title: output.panelTitle,
            content: output.panelContent,
            icon: "bolt.circle.fill",
            "icon-color": "#F48120",
        });
    } catch (e) {
        console.log(`[WARP] Error: ${e.message}\n${e.stack}`);
        $notification.post("WARP Optimizer", "❌ Script Error", e.message);
        $done({
            title: "WARP Optimizer",
            content: `❌ Error: ${e.message}`,
            icon: "xmark.circle.fill",
            "icon-color": "#FF3B30",
        });
    }
})();
