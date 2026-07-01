# WARP Endpoint IP 優選 — Surge 4 模組

自動測試 Cloudflare WARP Endpoint IP 延遲，選擇最優節點並顯示於面板。

---

## 📦 檔案說明

| 檔案 | 說明 |
|------|------|
| `warp-yxip.sgmodule` | Surge 4 模組定義 (iOS/macOS) |
| `warp-yxip.js` | Surge 4 測速腳本 |

---

## 🚀 快速開始

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
