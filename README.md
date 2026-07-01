# WARP Endpoint IP Optimizer — Surge 4 Module

Automatically test Cloudflare WARP endpoint IP latency and select the best node, displayed on a Surge panel.

---

## 📦 Files

| File | Description |
|------|-------------|
| `warp_hyper.sgmodule` | Surge 4 module definition (iOS/macOS) |
| `warp_hyper.js` | Surge 4 speed test script |

---

## 🚀 Quick Start

1. **Surge → Modules → Install Module from URL**
2. Enter the raw URL of the sgmodule file:
   ```
   https://raw.githubusercontent.com/echoapus/warphole/refs/heads/main/warp_hyper.sgmodule
   ```
3. Tap the **"WARP Optimizer"** panel to start the speed test
4. When the test completes:
   - The panel shows the best endpoint and latency
   - A push notification contains the full Top 10 results
   - Results are persisted locally

**Configurable Parameters (modify `argument` in the `.sgmodule` file):**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ipv6` | `false` | Set to `true` to enable IPv6 testing |
| `sample` | `15` | Number of IPs sampled per range |
| `timeout` | `3` | Per-test timeout in seconds |
| `concurrency` | `10` | Number of parallel tests |

---

## 🔧 How It Works

Since the Surge JS environment cannot send UDP packets, this script measures latency via **HTTP connection time** (TCP handshake). WARP endpoint IPs belong to Cloudflare's Anycast network, so TCP latency correlates closely with UDP latency.

---

## 📋 Tested IP Ranges

**IPv4:**
- `162.159.192.0/24`, `162.159.193.0/24`
- `162.159.195.0/24`, `162.159.204.0/24`
- `188.114.96.0/24`, `188.114.97.0/24`
- `188.114.98.0/24`, `188.114.99.0/24`

**IPv6:**
- `2606:4700:d0::/48`
- `2606:4700:d1::/48`

---

## 📌 Usage

After the speed test completes, replace the WireGuard Endpoint in your configuration:

```
engage.cloudflareclient.com:2408
```

with the best IP from the results (e.g. `162.159.192.123:2408`).

---

## 📄 License

MIT
