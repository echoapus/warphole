#!/bin/bash
set -euo pipefail
export LANG=en_US.UTF-8

# ── 顏色 ─────────────────────────────────────────────────
R='\033[31;1m' G='\033[32;1m' Y='\033[33;1m' N='\033[0m'
red()    { echo -e "${R}$*${N}"; }
green()  { echo -e "${G}$*${N}"; }
yellow() { echo -e "${Y}$*${N}"; }

# ── CPU 架構偵測 ──────────────────────────────────────────
arch_suffix() {
    case "$(uname -m)" in
        i386|i686)           echo '386'   ;;
        x86_64|amd64)        echo 'amd64' ;;
        armv8|arm64|aarch64) echo 'arm64' ;;
        s390x)               echo 's390x' ;;
        *) red "不支持的CPU架構!" >&2; exit 1 ;;
    esac
}

# ── 清理（含 Ctrl+C 中斷） ───────────────────────────────
cleanup() { rm -f warp result.csv; }
trap cleanup EXIT INT TERM

# ── Endpoint IP 優選 ──────────────────────────────────────
endpoint_select() {
    local base_url="https://gitlab.com/Misaka-blog/warp-script/-/raw/main/files/warp-yxip"



    # 下載優選工具 (來源: github.com/peanut996/CloudflareWarpSpeedTest)
    if ! wget -qO warp "${base_url}/warp-linux-$(arch_suffix)"; then
        red "下載優選工具失敗，請檢查網路連線。" >&2
        exit 1
    fi
    chmod +x warp

    # 放寬檔案描述符上限，以便並行測速
    ulimit -n 102400 2>/dev/null || true

    # 執行優選
    if [[ "${1:-}" == "6" ]]; then
        ./warp -ipv6
    else
        ./warp
    fi

    # 驗證結果
    if [[ ! -s result.csv ]]; then
        red "優選未產生結果，請重試。" >&2
        exit 1
    fi

    # 顯示 Top 10
    green "當前最優 Endpoint IP Top 10："
    awk -F, '$3 != "timeout ms"' result.csv \
        | sort -t, -nk2 -nk3 | uniq | head -11 \
        | awk -F, '{printf "端點 %-22s 丟包率 %-8s 平均延遲 %s\n", $1, $2, $3}'

    echo ""
    yellow "使用方法："
    yellow "  將 WireGuard 的 Endpoint IP（engage.cloudflareclient.com:2408）替換為上方最優 IP"
    yellow "  教程：https://blog.misaka.rest/2023/01/25/wireguard-warp"
}

# ── 主選單 ────────────────────────────────────────────────
main() {
    clear
    echo "#############################################################"
    echo "#############################################################"
    echo ""
    echo -e " ${G}1.${N} WARP IPv4 Endpoint IP 優選 ${Y}(默認)${N}"
    echo -e " ${G}2.${N} WARP IPv6 Endpoint IP 優選"
    echo " -------------"
    echo -e " ${G}0.${N} 退出脚本"
    echo ""
    read -rp "請輸入選項 [0-2]: " choice
    case "${choice:-1}" in
        2) endpoint_select 6 ;;
        0) exit 0 ;;
        *) endpoint_select   ;;
    esac
}

main
