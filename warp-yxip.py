#!/usr/bin/env python3
"""
WARP Endpoint IP 優選工具 — iOS / Python 版
僅使用標準庫，可在 a-Shell、Pythonista、Pyto 等 iOS 環境中運行。
也可在任何 Python 3.6+ 的桌面環境中使用。

用法：
  python3 warp-yxip.py          # IPv4 優選
  python3 warp-yxip.py -6       # IPv6 優選
  python3 warp-yxip.py -n 3     # 每個 IP 測 3 次
  python3 warp-yxip.py -w 30    # 30 個並行線程
"""

import socket
import struct
import time
import random
import os

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── 配置 ──────────────────────────────────────────────────

WARP_PORT = 2408
DEFAULT_TEST_COUNT = 5       # 每個 IP 測試次數
DEFAULT_TIMEOUT = 1.0        # 單次超時（秒）
DEFAULT_WORKERS = 30         # 並行線程數（iOS 建議 ≤ 50）
DEFAULT_SAMPLE = 100         # 每段抽取 IP 數


# Cloudflare WARP Endpoint IP 段
IPV4_TEMPLATES = [
    "162.159.192.{}", "162.159.193.{}",
    "162.159.195.{}", "162.159.204.{}",
    "188.114.96.{}",  "188.114.97.{}",
    "188.114.98.{}",  "188.114.99.{}",
]

IPV6_TEMPLATES = [
    "2606:4700:d0::{}", "2606:4700:d1::{}",
]

# ── 顏色輸出 ──────────────────────────────────────────────

def red(text):    print(f"\033[31;1m{text}\033[0m")
def green(text):  print(f"\033[32;1m{text}\033[0m")
def yellow(text): print(f"\033[33;1m{text}\033[0m")

# ── IP 生成 ───────────────────────────────────────────────

def generate_ips(ipv6=False, sample=DEFAULT_SAMPLE):
    """生成候選 Endpoint IP 列表"""
    ips = []
    if ipv6:
        for tpl in IPV6_TEMPLATES:
            ips.extend(tpl.format(format(random.randint(1, 0xFFFF), "x"))
                       for _ in range(sample))
    else:
        for tpl in IPV4_TEMPLATES:
            # 每段 1-254，全量 or 抽樣
            pool = list(range(1, 255))
            if sample < 254:
                pool = random.sample(pool, sample)
            ips.extend(tpl.format(i) for i in pool)
    random.shuffle(ips)
    return ips

# ── 單 IP 測速 ────────────────────────────────────────────

def test_endpoint(ip, port=WARP_PORT, count=DEFAULT_TEST_COUNT,
                  timeout=DEFAULT_TIMEOUT):
    """
    對 Endpoint IP 發送 WireGuard Initiation 封包 (type=1)，測量 RTT。
    回傳 dict: {ip, loss, latency_ms}
    """
    family = socket.AF_INET6 if ":" in ip else socket.AF_INET
    # WireGuard message type 1 (Initiation) + 隨機填充至 148 bytes
    payload = struct.pack("!I", 1) + os.urandom(144)

    latencies = []
    lost = 0

    for _ in range(count):
        sock = socket.socket(family, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        try:
            start = time.monotonic()
            sock.sendto(payload, (ip, port))
            sock.recvfrom(256)
            latencies.append((time.monotonic() - start) * 1000)
        except (socket.timeout, OSError):
            lost += 1
        finally:
            sock.close()

    loss_pct = lost / count * 100
    avg_ms = sum(latencies) / len(latencies) if latencies else float("inf")

    return {
        "ip": f"{ip}:{port}",
        "loss": round(loss_pct, 1),
        "latency_ms": round(avg_ms, 1) if avg_ms != float("inf") else None,
    }

# ── 主流程 ────────────────────────────────────────────────

def main():
    import argparse
    p = argparse.ArgumentParser(
        description="WARP Endpoint IP 優選工具（iOS / Python 版）")
    p.add_argument("-6", "--ipv6", action="store_true",
                   help="IPv6 優選")
    p.add_argument("-n", "--count", type=int, default=DEFAULT_TEST_COUNT,
                   help=f"每個 IP 測試次數（預設 {DEFAULT_TEST_COUNT}）")
    p.add_argument("-w", "--workers", type=int, default=DEFAULT_WORKERS,
                   help=f"並行線程數（預設 {DEFAULT_WORKERS}）")
    p.add_argument("-s", "--sample", type=int, default=DEFAULT_SAMPLE,
                   help=f"每段抽取 IP 數（預設 {DEFAULT_SAMPLE}）")
    args = p.parse_args()

    yellow(f"⏳ 生成候選 Endpoint IP ({'IPv6' if args.ipv6 else 'IPv4'})...")
    ips = generate_ips(ipv6=args.ipv6, sample=args.sample)
    yellow(f"⏳ 開始測試 {len(ips)} 個 IP（{args.workers} 並行，每 IP {args.count} 次）...")

    results = []
    done = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(test_endpoint, ip, WARP_PORT, args.count): ip
                   for ip in ips}
        for future in as_completed(futures):
            done += 1
            try:
                results.append(future.result())
            except Exception:
                pass
            if done % 50 == 0 or done == len(ips):
                yellow(f"⏳ 進度: {done}/{len(ips)}")

    # 過濾 timeout，按丟包率 → 延遲排序
    valid = [r for r in results if r["latency_ms"] is not None]
    valid.sort(key=lambda r: (r["loss"], r["latency_ms"]))

    if not valid:
        red("優選未產生有效結果，請檢查網路或稍後重試。")
        return

    green("當前最優 Endpoint IP Top 10：")
    print(f"  {'端點':<24} {'丟包率':<10} {'平均延遲'}")
    for r in valid[:10]:
        print(f"  {r['ip']:<24} {r['loss']:<9}% {r['latency_ms']} ms")

    print()
    yellow("使用方法：")
    yellow("  將 WireGuard 的 Endpoint IP（engage.cloudflareclient.com:2408）替換為上方最優 IP")
    yellow("  教程：https://blog.misaka.rest/2023/01/25/wireguard-warp")


if __name__ == "__main__":
    main()
