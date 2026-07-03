#!/usr/bin/env bash
set -euo pipefail

WARP_PORT=2408

IPV4_RANGES=(
  "162.159.192" "162.159.193"
  "162.159.195" "162.159.204"
  "188.114.96" "188.114.97"
  "188.114.98" "188.114.99"
)

IPV6_RANGES=(
  "2606:4700:d0::" "2606:4700:d1::"
)

usage() {
  cat <<'EOF'
Usage: warp_hyper.sh [--ipv6] [--sample N] [--timeout SECS] [--concurrency N] [--self-test]

  --ipv6          Test IPv6 ranges instead of IPv4
  --sample N      Candidate IPs per range (default: 15)
  --timeout SECS  Curl timeout in seconds (default: 3)
  --concurrency N Parallel probes (default: 10)
  --self-test     Run a quick non-network sanity check
EOF
}

random_int() {
  local min=$1 max=$2
  echo $(( RANDOM % (max - min + 1) + min ))
}

generate_ipv4() {
  local sample=$1
  local range last i
  for range in "${IPV4_RANGES[@]}"; do
    declare -A used=()
    for ((i = 0; i < sample && ${#used[@]} < 254; i++)); do
      while :; do
        last=$(random_int 1 254)
        [[ -z ${used[$last]+x} ]] && break
      done
      used["$last"]=1
      printf '%s.%s\n' "$range" "$last"
    done
  done
}

generate_ipv6() {
  local sample=$1
  local prefix i suffix
  for prefix in "${IPV6_RANGES[@]}"; do
    for ((i = 0; i < sample; i++)); do
      suffix=$(printf '%x' "$(random_int 1 65535)")
      printf '%s%s\n' "$prefix" "$suffix"
    done
  done
}

generate_ips() {
  local ipv6=$1 sample=$2
  if [[ $ipv6 -eq 1 ]]; then
    generate_ipv6 "$sample"
  else
    generate_ipv4 "$sample"
  fi
}

probe_ip() {
  local ip=$1 timeout=$2 outfile=$3
  local host code total latency status

  if [[ $ip == *:* ]]; then
    host="[$ip]"
  else
    host=$ip
  fi

  local out
  out=$(
    curl -g \
      -A 'Mozilla/5.0' \
      -H 'Connection: close' \
      --connect-timeout "$timeout" \
      --max-time "$timeout" \
      -o /dev/null \
      -sS \
      -w '%{http_code} %{time_total}' \
      "http://$host/cdn-cgi/trace" 2>/dev/null || true
  )

  read -r code total <<<"$out"
  latency=$(awk -v s="${total:-0}" 'BEGIN { printf "%d", s * 1000 }')

  if [[ ${code:-000} == 000 ]]; then
    if (( latency >= timeout * 1000 - 200 )); then
      status=timeout
      latency=
    else
      status=refused
    fi
  else
    status=$code
  fi

  printf '%s\t%s:%s\t%s\n' "${latency:-}" "$ip" "$WARP_PORT" "$status" >>"$outfile"
}

self_test() {
  local count line

  count=0
  while IFS= read -r line; do
    [[ $line =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
    ((++count))
  done < <(generate_ipv4 1)
  [[ $count -eq 8 ]] || return 1

  count=0
  while IFS= read -r line; do
    [[ $line =~ ^2606:4700:d[01]::[0-9a-f]+$ ]] || return 1
    ((++count))
  done < <(generate_ipv6 1)
  [[ $count -eq 2 ]] || return 1

  printf 'self-test ok\n'
}

main() {
  local ipv6=0 sample=15 timeout=3 concurrency=10

  while (($#)); do
    case $1 in
      --ipv6|-6) ipv6=1 ;;
      --sample) sample=${2:?missing value for --sample}; shift ;;
      --timeout) timeout=${2:?missing value for --timeout}; shift ;;
      --concurrency) concurrency=${2:?missing value for --concurrency}; shift ;;
      --self-test) self_test; return 0 ;;
      -h|--help) usage; return 0 ;;
      --probe)
        probe_ip "${2:?missing ip}" "${3:?missing timeout}" "${4:?missing outfile}"
        return 0
        ;;
      *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; return 1 ;;
    esac
    shift
  done

  local script_path
  script_path=${BASH_SOURCE[0]}
  tmpfile=$(mktemp)
  trap 'rm -f "$tmpfile"' EXIT

  local ips=() ip
  while IFS= read -r ip; do
    [[ -n $ip ]] && ips+=("$ip")
  done < <(generate_ips "$ipv6" "$sample")

  printf 'Testing %d candidate IPs...\n' "${#ips[@]}"

  printf '%s\n' "${ips[@]}" \
    | xargs -P "$concurrency" -I {} bash "$script_path" --probe "{}" "$timeout" "$tmpfile"

  local valid best_line best_latency best_endpoint best_status total_valid
  valid=$(awk -F'\t' '$1 != "" && $1 > 0 { print }' "$tmpfile" | sort -n -k1,1)
  total_valid=$(printf '%s\n' "$valid" | sed '/^$/d' | wc -l | awk '{print $1}')

  if [[ $total_valid -eq 0 ]]; then
    printf 'No reachable endpoints found.\n' >&2
    return 1
  fi

  best_line=$(printf '%s\n' "$valid" | head -n 1)
  IFS=$'\t' read -r best_latency best_endpoint best_status <<<"$best_line"

  printf 'Best: %s (%sms)\n' "$best_endpoint" "$best_latency"
  printf 'Tested: %d | Valid: %d\n' "${#ips[@]}" "$total_valid"
  printf '\nTop 10:\n'
  printf '%s\n' "$valid" \
    | head -n 10 \
    | awk -F'\t' '{ printf "%d. %s  %sms\n", NR, $2, $1 }'
}

main "$@"
