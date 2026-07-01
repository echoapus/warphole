/*
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  WARP Endpoint IP 優選 — Surge 4 腳本
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  原理：
 *    對 Cloudflare WARP Endpoint IP 段發送 HTTP 請求，
 *    透過連線建立時間（TCP handshake）估算網路延遲。
 *    因為 WARP WireGuard 端點與 HTTP 服務共用相同的
 *    Cloudflare Anycast IP，TCP 延遲與 UDP 延遲高度相關。
 *
 *  環境：Surge 4+ (iOS / macOS)
 *  腳本類型：generic（面板觸發）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// ── 常量 ──────────────────────────────────────────────────

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

// ── 解析參數 ──────────────────────────────────────────────

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
        console.log(`[WARP] 參數解析失敗: ${e.message}`);
    }

    return defaults;
}

// ── IP 生成 ───────────────────────────────────────────────

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

// ── 單 IP 測速 ────────────────────────────────────────────

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
                    // 如果耗時接近超時值，視為不可達
                    if (elapsed >= timeoutMs - 200) {
                        resolve({ ip, port: WARP_PORT, latency: null, status: "timeout" });
                    } else {
                        // 連線被拒/重設 — 仍然反映真實 RTT
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

// ── 並行控制 ──────────────────────────────────────────────

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

// ── 格式化輸出 ────────────────────────────────────────────

function formatResults(valid, total, ipv6) {
    const topN = valid.slice(0, 10);
    const best = topN[0];

    const lines = topN.map(
        (r, i) => `${i + 1}. ${r.ip}:${r.port}  ${r.latency}ms`
    );

    const header = `🏆 最優: ${best.ip}:${best.port} (${best.latency}ms)`;
    const stats = `📊 測試 ${total} 個${ipv6 ? " IPv6" : ""} | 有效 ${valid.length} 個`;
    const time = `🕐 ${new Date().toLocaleString("zh-TW")}`;

    return {
        panelTitle: "WARP 優選",
        panelContent: `${header}\n${stats}\n${time}`,
        fullList: lines.join("\n"),
        bestEndpoint: `${best.ip}:${best.port}`,
        bestLatency: best.latency,
    };
}

// ── 主流程 ────────────────────────────────────────────────

(async () => {
    const config = parseArgs();
    const startTime = Date.now();

    console.log(`[WARP] 開始測速 — IPv${config.ipv6 ? "6" : "4"}, 抽樣=${config.sample}, 並行=${config.concurrency}`);

    try {
        // 1. 生成候選 IP
        const ips = config.ipv6
            ? generateIPv6(config.sample)
            : generateIPv4(config.sample);

        console.log(`[WARP] 共 ${ips.length} 個候選 IP`);

        // 2. 並行測速
        const tasks = ips.map((ip) => () => testEndpoint(ip, config.timeout));
        const results = await runWithConcurrency(tasks, config.concurrency);

        // 3. 篩選有效結果，按延遲排序
        const valid = results
            .filter((r) => r.latency !== null && r.latency > 0)
            .sort((a, b) => a.latency - b.latency);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[WARP] 測速完成，耗時 ${elapsed}s，有效 ${valid.length}/${results.length}`);

        // 4. 無有效結果
        if (valid.length === 0) {
            $notification.post("WARP 優選", "❌ 測速失敗", "未找到可用端點，請檢查網路後重試");
            $done({
                title: "WARP 優選",
                content: "❌ 未找到可用端點\n請檢查網路連線後重試",
                icon: "xmark.circle.fill",
                "icon-color": "#FF3B30",
            });
            return;
        }

        // 5. 格式化並輸出
        const output = formatResults(valid, ips.length, config.ipv6);

        // 6. 持久化儲存結果
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

        // 7. 推送通知（含完整 Top 10）
        $notification.post(
            "WARP 優選完成 ✅",
            `最優端點: ${output.bestEndpoint} (${output.bestLatency}ms)`,
            `${output.fullList}\n\n耗時: ${elapsed}s | 使用方法：將 WireGuard Endpoint 替換為上方最優 IP`
        );

        // 8. 更新面板
        $done({
            title: output.panelTitle,
            content: output.panelContent,
            icon: "bolt.circle.fill",
            "icon-color": "#F48120",
        });
    } catch (e) {
        console.log(`[WARP] 錯誤: ${e.message}\n${e.stack}`);
        $notification.post("WARP 優選", "❌ 腳本錯誤", e.message);
        $done({
            title: "WARP 優選",
            content: `❌ 錯誤: ${e.message}`,
            icon: "xmark.circle.fill",
            "icon-color": "#FF3B30",
        });
    }
})();
