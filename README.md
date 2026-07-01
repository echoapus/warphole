# WARP Endpoint IP 優選工具

自動測試 Cloudflare WARP Endpoint IP 延遲，選擇最優節點。

支援多種運行環境：**Python**、**Bash (Linux)**、**Surge 4 模組 (iOS/macOS)**。

---

## 📦 檔案說明

| 檔案 | 環境 | 說明 |
|------|------|------|
| `warp-yxip.py` | Python 3.6+ | 跨平台版本，可在 iOS (a-Shell / Pythonista) 和桌面環境運行 |
| `warp-yxip.sh` | Linux / Bash | 下載並運行 CloudflareWarpSpeedTest 二進位 |
| `warp-yxip.sgmodule` | Surge 4 (iOS/macOS) | Surge 模組定義 |
| `warp-yxip.js` | Surge 4 (iOS/macOS) | Surge 測速腳本 |

---

## 🚀 快速開始

### Python 版

```bash
# IPv4 優選（預設）
python3 warp-yxip.py

# IPv6 優選
python3 warp-yxip.py -6

# 自定義參數
python3 warp-yxip.py -n 3 -w 50 -s 200
```

**參數：**
| 參數 | 預設 | 說明 |
|------|------|------|
| `-6` | — | 啟用 IPv6 優選 |
| `-n` | 5 | 每個 IP 測試次數 |
| `-w` | 30 | 並行線程數 |
| `-s` | 100 | 每段抽取 IP 數 |

### Bash 版

```bash
chmod +x warp-yxip.sh
./warp-yxip.sh
```

透過互動式選單選擇 IPv4 或 IPv6 優選。

### Surge 4 模組

1. 將 `warp-yxip.sgmodule` 和 `warp-yxip.js` 放在同一目錄，或將 `.js` 上傳至可存取的 URL 並修改模組中的 `script-path`
2. **Surge → 模組 → 安裝模組**
3. 點擊面板中的「**WARP 優選**」開始測速
4. 測速完成後：
   - 面板顯示最優端點和延遲
   - 推送通知包含完整 Top 10
   - 結果持久化儲存

**可調參數（在 `.sgmodule` 的 `argument` 中修改）：**

| 參數 | 預設 | 說明 |
|------|------|------|
| `ipv6` | `false` | 設為 `true` 啟用 IPv6 |
| `sample` | `15` | 每段 IP 抽取數量 |
| `timeout` | `3` | 單次超時（秒） |
| `concurrency` | `10` | 並行測試數 |

---

## 🔧 原理

### Python / Bash 版
對 WARP Endpoint IP 發送 **WireGuard Initiation 封包**（UDP type=1），測量 RTT 和丟包率。

### Surge 4 版
因 Surge JS 環境無法發送 UDP，改用 **HTTP 連線時間**（TCP handshake）測量延遲。WARP 端點 IP 屬於 Cloudflare Anycast 網段，TCP 延遲與 UDP 延遲高度相關。

---

## 📋 測試的 IP 段

**IPv4：**
- `162.159.192.0/24`、`162.159.193.0/24`
- `162.159.195.0/24`、`162.159.204.0/24`
- `188.114.96.0/24`、`188.114.97.0/24`
- `188.114.98.0/24`、`188.114.99.0/24`

**IPv6：**
- `2606:4700:d0::/48`
- `2606:4700:d1::/48`

---

## 📌 使用方法

測速完成後，將 WireGuard 配置中的 Endpoint：

```
engage.cloudflareclient.com:2408
```

替換為測速結果中的最優 IP（例如 `162.159.192.123:2408`）。

---

## 📄 License

MIT
