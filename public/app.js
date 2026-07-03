// ── IP Ranges ─────────────────────────────────────────────
const IPV4_RANGES = [
  "162.159.192", "162.159.193",
  "162.159.195", "162.159.204",
  "188.114.96",  "188.114.97",
  "188.114.98",  "188.114.99",
];

const IPV6_RANGES = [
  "2606:4700:d0::", "2606:4700:d1::",
];

// ── DOM Elements ──────────────────────────────────────────
const ipv4Radio = document.getElementById('ipv4-radio');
const ipv6Radio = document.getElementById('ipv6-radio');
const sampleRange = document.getElementById('sample-range');
const sampleDisplay = document.getElementById('sample-display');
const concurrencyRange = document.getElementById('concurrency-range');
const concurrencyDisplay = document.getElementById('concurrency-display');
const timeoutRange = document.getElementById('timeout-range');
const timeoutDisplay = document.getElementById('timeout-display');
const totalIpsPreview = document.getElementById('total-ips-preview');

const btnStartTest = document.getElementById('btn-start-test');
const btnCancel = document.getElementById('btn-cancel');

const statusPanel = document.getElementById('status-panel');
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
const statTested = document.getElementById('stat-tested');
const statValid = document.getElementById('stat-valid');
const statBest = document.getElementById('stat-best');
const statusLog = document.getElementById('status-log');

const resultsPanel = document.getElementById('results-panel');
const resultsTableBody = document.getElementById('results-table-body');
const bestHero = document.getElementById('best-hero');
const bestHeroEndpoint = document.getElementById('best-hero-endpoint');
const bestHeroLatency = document.getElementById('best-hero-latency');
const bestHeroSource = document.getElementById('best-hero-source');

const btnCopyBest = document.getElementById('btn-copy-best');
const btnCopyWg = document.getElementById('btn-copy-wg');
const toast = document.getElementById('toast-notification');

const protocolBanner = document.getElementById('protocol-banner');
const protocolBannerText = document.getElementById('protocol-banner-text');

// State Variables
let abortController = null;
let currentResults = [];
let testInProgress = false;

// ── Protocol Detection ────────────────────────────────────
function detectProtocol() {
  const protocol = window.location.protocol;
  if (protocol === 'https:') {
    protocolBanner.classList.add('https-mode');
    protocolBannerText.innerHTML = `<strong>⚠️ HTTPS Mode:</strong> Browser blocks raw HTTP requests on secure sites. Testing will use HTTPS TLS connection attempts. Although requests reject due to SSL certificate name mismatches, <em>latency remains highly accurate (~2 RTTs)</em>. For absolute precision, download and run this file locally or serve it over HTTP.`;
  } else if (protocol === 'file:') {
    protocolBanner.classList.remove('https-mode');
    protocolBannerText.innerHTML = `<strong>📂 Local File Mode:</strong> Running directly from your computer. Probes will use high-precision, 1 RTT HTTP requests.`;
  } else {
    protocolBanner.classList.remove('https-mode');
    protocolBannerText.innerHTML = `<strong>⚡ HTTP Mode:</strong> Latency is measured using native, high-precision 1 RTT HTTP requests. This is the optimal testing method.`;
  }
}

// ── Config Sync ──────────────────────────────────────────
function updatePreviews() {
  const sample = parseInt(sampleRange.value, 10);
  const isV6 = ipv6Radio.checked;
  const rangeCount = isV6 ? IPV6_RANGES.length : IPV4_RANGES.length;
  totalIpsPreview.textContent = sample * rangeCount;
}

sampleRange.addEventListener('input', () => {
  sampleDisplay.textContent = sampleRange.value;
  updatePreviews();
});

concurrencyRange.addEventListener('input', () => {
  concurrencyDisplay.textContent = concurrencyRange.value;
});

timeoutRange.addEventListener('input', () => {
  timeoutDisplay.textContent = parseFloat(timeoutRange.value).toFixed(1) + 's';
});

ipv4Radio.addEventListener('change', updatePreviews);
ipv6Radio.addEventListener('change', updatePreviews);

// Initial setup
detectProtocol();
updatePreviews();

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

function generateCandidates(isV6, sample) {
  const ips = [];
  if (isV6) {
    for (const prefix of IPV6_RANGES) {
      for (let i = 0; i < sample; i++) {
        const suffix = randomInt(1, 65535).toString(16);
        ips.push(`${prefix}${suffix}`);
      }
    }
  } else {
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
  }
  return shuffle(ips);
}

// ── Single IP Client Probe ───────────────────────────────
function probeEndpoint(ip, timeoutSec, signal) {
  return new Promise((resolve) => {
    const start = Date.now();
    const isV6 = ip.includes(":");
    const host = isV6 ? `[${ip}]` : ip;
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    
    // Cloudflare response time testing
    const url = `${protocol}//${host}/cdn-cgi/trace`;
    
    const timeoutMs = timeoutSec * 1000;
    const timer = setTimeout(() => {
      resolve({ ip, latency: null, status: 'timeout' });
    }, timeoutMs);

    // Cancel callback
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve({ ip, latency: null, status: 'cancelled' });
      });
    }

    fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: signal
    })
    .then(() => {
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      resolve({ ip, latency: elapsed, status: '200' });
    })
    .catch((err) => {
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      if (err.name === 'AbortError') {
        resolve({ ip, latency: null, status: 'cancelled' });
      } else if (elapsed >= timeoutMs - 200) {
        resolve({ ip, latency: null, status: 'timeout' });
      } else {
        // SSL cert name mismatch or CORS error, but still connected (real roundtrip)
        resolve({ ip, latency: elapsed, status: 'refused' });
      }
    });
  });
}

// ── Concurrency Executor ──────────────────────────────────
async function runClientScan(ips, concurrency, timeout, signal) {
  const results = [];
  const pool = new Set();
  let completed = 0;
  let validCount = 0;
  let bestLatency = null;

  for (const ip of ips) {
    if (signal && signal.aborted) break;

    const promise = (async () => {
      statusLog.textContent = `Probing: ${ip}...`;
      const result = await probeEndpoint(ip, timeout, signal);
      completed++;
      
      if (result.latency !== null && result.latency > 0) {
        validCount++;
        results.push(result);
        if (bestLatency === null || result.latency < bestLatency) {
          bestLatency = result.latency;
          statBest.textContent = `${bestLatency}ms`;
        }
      }

      // Update UI Progress
      const percent = Math.round((completed / ips.length) * 100);
      progressBar.style.width = `${percent}%`;
      statTested.textContent = `${completed} / ${ips.length}`;
      statValid.textContent = validCount;
      
      pool.delete(promise);
    })();

    pool.add(promise);
    if (pool.size >= concurrency) {
      await Promise.race(pool);
    }
  }

  await Promise.all(pool);
  return results.filter(r => r.status !== 'cancelled');
}

// ── UI Control State ──────────────────────────────────────
function setUIStateTesting() {
  testInProgress = true;
  statusPanel.classList.remove('hidden');
  resultsPanel.classList.add('hidden');
  
  statusMessage.textContent = `Testing Endpoints...`;
  progressBar.style.width = '0%';
  statTested.textContent = '0 / 0';
  statValid.textContent = '0';
  statBest.textContent = '-';
  statusLog.textContent = 'Initializing test runner...';
  
  btnStartTest.disabled = true;
}

function setUIStateIdle() {
  testInProgress = false;
  statusPanel.classList.add('hidden');
  btnStartTest.disabled = false;
}

// ── Test Runner ───────────────────────────────────────────
async function handleTest() {
  if (testInProgress) return;
  
  const isV6 = ipv6Radio.checked;
  const sample = parseInt(sampleRange.value, 10);
  const concurrency = parseInt(concurrencyRange.value, 10);
  const timeout = parseFloat(timeoutRange.value);

  setUIStateTesting();
  
  abortController = new AbortController();
  const ips = generateCandidates(isV6, sample);
  
  statTested.textContent = `0 / ${ips.length}`;
  
  try {
    const results = await runClientScan(ips, concurrency, timeout, abortController.signal);
    if (abortController.signal.aborted) {
      showToast('Scan Cancelled');
      setUIStateIdle();
      return;
    }
    
    currentResults = results
      .filter(r => r.latency !== null)
      .sort((a, b) => a.latency - b.latency);
      
    displayResults(currentResults);
  } catch (err) {
    console.error(err);
    statusLog.textContent = `Error: ${err.message}`;
  } finally {
    setUIStateIdle();
  }
}

// ── Display Results ───────────────────────────────────────
function displayResults(results) {
  setUIStateIdle();
  
  if (results.length === 0) {
    statusPanel.classList.remove('hidden');
    statusMessage.textContent = '❌ Scan Failed';
    statusLog.textContent = 'No reachable Cloudflare Warp endpoints found. Check your network or try adjusting timeout.';
    return;
  }

  resultsPanel.classList.remove('hidden');
  resultsTableBody.innerHTML = '';
  
  const best = results[0];
  bestHeroEndpoint.textContent = `${best.ip}:2408`;
  bestHeroLatency.textContent = `${best.latency} ms`;
  bestHeroSource.textContent = window.location.protocol === 'https:' ? 'Client Scan (HTTPS TLS)' : 'Client Scan (HTTP)';
  
  // Show relative latency scale bars
  const maxLatency = Math.max(...results.slice(0, 10).map(r => r.latency));
  const minLatency = best.latency;
  
  results.slice(0, 15).forEach((r, idx) => {
    const tr = document.createElement('tr');
    
    // Classify speed
    let speedClass = 'speed-fast';
    if (r.latency > 150) speedClass = 'speed-slow';
    else if (r.latency > 70) speedClass = 'speed-medium';

    // Calculate bar percentage
    const barWidth = maxLatency === minLatency ? 100 : Math.round((minLatency / r.latency) * 100);

    tr.innerHTML = `
      <td><span class="rank-badge">${idx + 1}</span></td>
      <td><span class="ip-text">${r.ip}:2408</span></td>
      <td>
        <div class="latency-cell">
          <span class="latency-badge ${speedClass}">${r.latency} ms</span>
          <div class="latency-bar-track">
            <div class="latency-bar-fill ${speedClass}" style="width: ${barWidth}%"></div>
          </div>
        </div>
      </td>
      <td><span class="status-badge status-${r.status}">${r.status === 'refused' ? 'refused/alive' : r.status}</span></td>
      <td style="text-align: right;">
        <button class="btn-table-action" onclick="copyText('${r.ip}:2408')">Copy</button>
      </td>
    `;
    resultsTableBody.appendChild(tr);
  });

  // Scroll to results
  resultsPanel.scrollIntoView({ behavior: 'smooth' });
}

// ── Helper Utilities ──────────────────────────────────────
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2000);
}

btnStartTest.addEventListener('click', handleTest);

btnCancel.addEventListener('click', () => {
  if (abortController) {
    abortController.abort();
  }
});

btnCopyBest.addEventListener('click', () => {
  if (currentResults.length > 0) {
    copyText(`${currentResults[0].ip}:2408`);
  }
});

btnCopyWg.addEventListener('click', () => {
  if (currentResults.length > 0) {
    const wgConfig = `[Interface]
PrivateKey = <YOUR_PRIVATE_KEY>
Address = 172.16.0.2/32, fd01:5ca1:ab12::5/128
DNS = 1.1.1.1, 2606:4700:4700::1111

[Peer]
PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
Endpoint = ${currentResults[0].ip}:2408
AllowedIPs = 0.0.0.0/0, ::/0`;
    copyText(wgConfig);
  }
});

// Global copy utility helper mapping to window for onclick handler in string templates
window.copyText = copyText;
