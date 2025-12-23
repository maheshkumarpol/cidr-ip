/********************
 * CONFIG
 ********************/
const PAGE_SIZE = 256;          // IPs per page for pagination
const MAX_DOWNLOAD = 1_000_000; // Hard safety limit for download

/********************
 * STATE
 ********************/
let currentPage = 1;
let ipArray = [];

let lastNetwork = null;
let lastBroadcast = null;
let lastTotal = 0;

/********************
 * UTILITIES
 ********************/
function ipToNum(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) throw "Invalid IP format";
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) {
      throw "Invalid IP octet";
    }
    n = (n << 8) + x;
  }
  return n >>> 0;
}

function numToIp(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join(".");
}

function parseCIDR(cidr) {
  const match = cidr.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!match) throw "Use format like 192.168.1.0/24";

  const ipNum = ipToNum(match[1]);
  const prefix = Number(match[2]);
  if (prefix < 0 || prefix > 32) throw "Prefix must be between 0 and 32";

  return { ipNum, prefix };
}

function cidrCalc(cidr) {
  const { ipNum, prefix } = parseCIDR(cidr);
  const hostBits = 32 - prefix;
  const total = 2 ** hostBits;

  const mask =
    hostBits === 32 ? 0 : (~(total - 1) >>> 0);

  const network = (ipNum & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;

  return { network, broadcast, total, prefix };
}

/********************
 * RENDERING
 ********************/
function renderPage() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = ipArray.slice(start, end);

  document.getElementById("ipList").textContent =
    pageItems.join("\n");

  const totalPages = Math.max(
    1,
    Math.ceil(ipArray.length / PAGE_SIZE)
  );

  document.getElementById("pageInfo").textContent =
    `Page ${currentPage} of ${totalPages}`;
}

/********************
 * EVENT HANDLERS
 ********************/
document.getElementById("cidrInput").addEventListener("input", e => {
  const value = e.target.value.trim();
  const errorEl = document.getElementById("error");
  const warningEl = document.getElementById("ipWarning");

  if (!value) {
    errorEl.textContent = "";
    warningEl.textContent = "";
    ipArray = [];
    currentPage = 1;
    renderPage();
    return;
  }

  try {
    const r = cidrCalc(value);

    // Persist for download (CRITICAL FIX)
    lastNetwork = r.network;
    lastBroadcast = r.broadcast;
    lastTotal = r.total;

    // Populate summary table
    document.getElementById("network").textContent = numToIp(r.network);
    document.getElementById("broadcast").textContent = numToIp(r.broadcast);
    document.getElementById("total").textContent = r.total;
    document.getElementById("usable").textContent = Math.max(r.total - 2, 0);
    document.getElementById("first").textContent =
      r.total > 2 ? numToIp(r.network + 1) : "N/A";
    document.getElementById("last").textContent =
      r.total > 2 ? numToIp(r.broadcast - 1) : "N/A";

    // Reset list
    ipArray = [];
    currentPage = 1;

    // Guardrail for huge ranges
    if (r.total > 65536) {
      warningEl.textContent =
        `This CIDR contains ${r.total} IPs. Pagination is disabled. Use the download button to export IPs safely.`;
    } else {
      warningEl.textContent = "";
      for (let i = r.network; i <= r.broadcast; i++) {
        ipArray.push(numToIp(i));
      }
    }

    renderPage();
    errorEl.textContent = "";

  } catch (err) {
    errorEl.textContent = err;
    warningEl.textContent = "";
    ipArray = [];
    currentPage = 1;
    renderPage();
  }
});

document.getElementById("prevPage").onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    renderPage();
  }
};

document.getElementById("nextPage").onclick = () => {
  if (currentPage * PAGE_SIZE < ipArray.length) {
    currentPage++;
    renderPage();
  }
};

/********************
 * DOWNLOAD HANDLER
 * (CRITICAL BUG FIXED)
 ********************/
document.getElementById("downloadBtn").onclick = () => {
  if (lastNetwork === null || lastBroadcast === null) return;

  let end = lastBroadcast;

  if (lastTotal > MAX_DOWNLOAD) {
    alert(
      `This CIDR contains ${lastTotal} IPs.\n` +
      `Download is limited to ${MAX_DOWNLOAD.toLocaleString()} IPs to avoid browser crashes.`
    );
    end = lastNetwork + MAX_DOWNLOAD - 1;
  }

  const lines = [];
  for (let i = lastNetwork; i <= end; i++) {
    lines.push(numToIp(i));
  }

  const blob = new Blob([lines.join("\n")], {
    type: "text/plain"
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "cidr-ip-list.txt";
  link.click();
};

/********************
 * CLEAR
 ********************/
document.getElementById("clearBtn").onclick = () => {
  location.reload();
};

document.getElementById("year").textContent =
  new Date().getFullYear();
