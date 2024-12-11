const bybitPriceEl = document.getElementById("bybit-price");
const binancePriceEl = document.getElementById("binance-price");
const dropdownButton = document.getElementById("pair-dropdown-button");
const dropdownPanel = document.getElementById("pair-dropdown-panel");
const pairListEl = document.getElementById("pair-list");
const searchInput = document.getElementById("search-input");

let bybitCurrentNumeric = null;
let bybitOldNumeric = null;
let binanceCurrentNumeric = null;
let binanceOldNumeric = null;

let binanceSocket = null;
let bybitSocket = null;
let currentPair = null;
let commonPairs = []; // {symbol, totalVolume, ...}

// Update old prices every 5 seconds
setInterval(() => {
  if (bybitCurrentNumeric !== null) {
    bybitOldNumeric = bybitCurrentNumeric;
  }
  if (binanceCurrentNumeric !== null) {
    binanceOldNumeric = binanceCurrentNumeric;
  }
}, 5000);

function updatePrice(el, currentNumeric, oldNumeric, displayString) {
  if (oldNumeric === null) {
    el.style.color = "#333";
  } else if (currentNumeric > oldNumeric) {
    el.style.color = "green";
  } else if (currentNumeric < oldNumeric) {
    el.style.color = "red";
  } else {
    el.style.color = "#333";
  }
  el.textContent = displayString;
}

async function fetchPairs() {
  const binanceResp = await fetch("https://api.binance.com/api/v3/ticker/24hr");
  const binanceData = await binanceResp.json();

  const binanceMap = {};
  for (const ticker of binanceData) {
    if (ticker.symbol.endsWith("USDT")) {
      binanceMap[ticker.symbol] = {
        symbol: ticker.symbol,
        volume: parseFloat(ticker.quoteVolume)
      };
    }
  }

  const bybitResp = await fetch("https://api.bybit.com/v5/market/tickers?category=spot");
  const bybitData = await bybitResp.json();
  const bybitTickers = bybitData.result.list;

  const bybitMap = {};
  for (const t of bybitTickers) {
    const symbol = t.symbol;
    if (symbol.endsWith("USDT")) {
      bybitMap[symbol] = {
        symbol: symbol,
        volume: parseFloat(t.volume24h)
      };
    }
  }

  const common = [];
  for (const sym in binanceMap) {
    if (bybitMap[sym]) {
      const totalVolume = binanceMap[sym].volume + bybitMap[sym].volume;
      common.push({
        symbol: sym,
        binanceVolume: binanceMap[sym].volume,
        bybitVolume: bybitMap[sym].volume,
        totalVolume: totalVolume
      });
    }
  }

  common.sort((a,b) => b.totalVolume - a.totalVolume);
  return common;
}

function renderPairs(pairs) {
  pairListEl.innerHTML = "";
  for (const p of pairs) {
    const li = document.createElement("li");
    const base = p.symbol.slice(0, -4);
    li.textContent = `${base}/USDT`;
    li.dataset.symbol = p.symbol;
    pairListEl.appendChild(li);
  }
}

function filterPairs(query) {
  const q = query.trim().toUpperCase();
  const filtered = commonPairs.filter(p => p.symbol.includes(q));
  renderPairs(filtered);
}

function closeSockets() {
  if (binanceSocket && binanceSocket.readyState === WebSocket.OPEN) {
    binanceSocket.close();
  }
  if (bybitSocket && bybitSocket.readyState === WebSocket.OPEN) {
    bybitSocket.close();
  }
  binanceSocket = null;
  bybitSocket = null;
}

function initializeSockets(pair) {
  // Reset old prices
  bybitCurrentNumeric = null;
  bybitOldNumeric = null;
  binanceCurrentNumeric = null;
  binanceOldNumeric = null;
  bybitPriceEl.textContent = "Loading...";
  binancePriceEl.textContent = "Loading...";
  bybitPriceEl.style.color = "#333";
  binancePriceEl.style.color = "#333";

  const binancePair = pair.toLowerCase();

  // Binance WebSocket
  binanceSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${binancePair}@ticker`);
  binanceSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.c) {
      const priceStr = data.c;
      const priceNum = parseFloat(priceStr);
      binanceCurrentNumeric = priceNum;
      updatePrice(binancePriceEl, binanceCurrentNumeric, binanceOldNumeric, priceStr);
    }
  };
  binanceSocket.onerror = (error) => {
    console.error("Binance WebSocket error:", error);
  };

  // Bybit WebSocket
  bybitSocket = new WebSocket("wss://stream.bybit.com/v5/public/spot");
  bybitSocket.onopen = () => {
    const msg = {
      op: "subscribe",
      args: [`tickers.${pair}`]
    };
    bybitSocket.send(JSON.stringify(msg));
  };
  bybitSocket.onmessage = (event) => {
    const response = JSON.parse(event.data);
    if ((response.type === "snapshot" || response.type === "delta") && response.topic === `tickers.${pair}`) {
      if (response.data && response.data.lastPrice) {
        const priceStr = response.data.lastPrice;
        const priceNum = parseFloat(priceStr);
        bybitCurrentNumeric = priceNum;
        updatePrice(bybitPriceEl, bybitCurrentNumeric, bybitOldNumeric, priceStr);
      }
    }
  };
  bybitSocket.onerror = (error) => {
    console.error("Bybit WebSocket error:", error);
  };
}

// Dropdown logic
dropdownButton.addEventListener("click", () => {
  dropdownPanel.classList.toggle("open");
  if (dropdownPanel.classList.contains("open")) {
    searchInput.value = "";
    filterPairs(""); // show all
    searchInput.focus();
  }
});

document.addEventListener("click", (e) => {
  if (!dropdownPanel.contains(e.target) && e.target !== dropdownButton) {
    dropdownPanel.classList.remove("open");
  }
});

pairListEl.addEventListener("click", (e) => {
  if (e.target.tagName === "LI") {
    const newPair = e.target.dataset.symbol;
    if (newPair && newPair !== currentPair) {
      currentPair = newPair;
      dropdownButton.textContent = e.target.textContent;
      closeSockets();
      initializeSockets(currentPair);
    }
    dropdownPanel.classList.remove("open");
  }
});

searchInput.addEventListener("input", () => {
  const query = searchInput.value;
  filterPairs(query);
});

// Initialize
(async () => {
  commonPairs = await fetchPairs();
  if (commonPairs.length > 0) {
    renderPairs(commonPairs);
    currentPair = "BTCUSDT";
    dropdownButton.textContent = `${currentPair.slice(0,-4)}/USDT`;
    initializeSockets("BTCUSDT");
  } else {
    dropdownButton.textContent = "No common pairs";
  }
})();
