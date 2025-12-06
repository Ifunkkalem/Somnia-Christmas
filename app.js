/* app.js — Somnia Mainnet (StartGame on-chain 0.01 SOMI) */

/* ========== CONFIG (sesuaikan bila perlu) ========== */
const SOMNIA_CHAIN = {
  chainId: "0x13a7", // 5031 mainnet dari kamu
  chainName: "Somnia Mainnet",
  nativeCurrency: { name: "Somnia Token", symbol: "SOMI", decimals: 18 },
  rpcUrls: ["https://api.infra.mainnet.somnia.network"],
};

const CONTRACT_LEADERBOARD = "0xD76b767102f2610b0C97FEE84873c1fAA4c7C365"; // contract onchain kamu
const START_FEE = "0.01"; // SOMI (native) to send when play

/* ========== STATE ========== */
let provider = null;
let signer = null;
let userAddress = null;

/* ========== UTILS ========== */
function logAct(msg) {
  const el = document.getElementById("activityLog");
  if (!el) return;
  const now = new Date().toLocaleTimeString();
  el.innerText = `[${now}] ${msg}`;
  console.log(msg);
}

function shortAddr(a){
  if(!a) return "-";
  return a.slice(0,6) + "..." + a.slice(-4);
}

/* ========== DOM ========= */
const btnConnect = document.getElementById("btnConnect");
const addrDisplay = document.getElementById("addrDisplay");
const balanceSomiEl = document.getElementById("balanceSomi");
const btnPlay = document.getElementById("btnPlay");
const btnSaveName = document.getElementById("btnSaveName");
const displayNameInput = document.getElementById("displayNameInput");
const menuScreen = document.getElementById("menuScreen");
const playScreen = document.getElementById("playScreen");
const leaderboardScreen = document.getElementById("leaderboardScreen");
const btnBackFromPlay = document.getElementById("btnBackFromPlay");
const btnBackFromLb = document.getElementById("btnBackFromLb");
const gameFrame = document.getElementById("gameFrame");
const playPlayerName = document.getElementById("playPlayerName");
const playAddr = document.getElementById("playAddr");
const leaderboardList = document.getElementById("leaderboardList");

/* ========== CHAIN & WALLET HELPERS ========== */
async function waitForEthereum() {
  return new Promise((resolve) => {
    if (window.ethereum) return resolve(true);
    let tries = 0;
    const t = setInterval(() => {
      if (window.ethereum || ++tries > 25) {
        clearInterval(t);
        resolve(!!window.ethereum);
      }
    }, 150);
  });
}

async function ensureChain() {
  try {
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (current === SOMNIA_CHAIN.chainId) return true;

    // try switch
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SOMNIA_CHAIN.chainId }]
      });
      return true;
    } catch (switchErr) {
      // try add
      if (switchErr && switchErr.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [SOMNIA_CHAIN]
        });
        return true;
      }
      throw switchErr;
    }
  } catch (e) {
    console.error("ensureChain error:", e);
    return false;
  }
}

async function connectWallet() {
  const ok = await waitForEthereum();
  if (!ok) {
    alert("MetaMask tidak ditemukan. Buka halaman ini di MetaMask atau browser dengan wallet.");
    return;
  }

  const chainOk = await ensureChain();
  if (!chainOk) {
    alert("Gagal switch/add Somnia Mainnet di MetaMask.");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum, "any");
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  try {
    userAddress = await signer.getAddress();
  } catch(e){
    alert("Gagal mendapatkan alamat wallet.");
    console.error(e);
    return;
  }

  addrDisplay.innerText = shortAddr(userAddress);
  btnConnect.innerText = "Connected";
  btnConnect.disabled = true;

  // save display name if previously stored
  const saved = localStorage.getItem(`displayName_${userAddress}`);
  if (saved) displayNameInput.value = saved;

  await refreshBalance();
  logAct("Wallet connected: " + userAddress);

  // enable messages to iframe (so iframe can request start)
  window.addEventListener("message", handleIframeMessage);
}

/* ========== BALANCE ========== */
async function refreshBalance(){
  if(!provider || !userAddress) return;
  try {
    const bal = await provider.getBalance(userAddress);
    balanceSomiEl.innerText = Number(ethers.utils.formatEther(bal)).toFixed(4);
  } catch(e){
    balanceSomiEl.innerText = "-";
    console.error("refreshBalance error", e);
  }
}

/* ========== SAVE DISPLAY NAME ========== */
btnSaveName.onclick = () => {
  if (!userAddress) {
    alert("Sambungkan wallet terlebih dahulu untuk menyimpan nama untuk wallet ini.");
    return;
  }
  const name = (displayNameInput.value || "").trim();
  if(!name) { alert("Nama kosong"); return; }
  if(name.length > 12){ alert("Max 12 karakter"); return; }
  localStorage.setItem(`displayName_${userAddress}`, name);
  alert("Display name tersimpan untuk wallet kamu.");
  logAct("Display name saved: " + name);
};

/* ========== PLAY FLOW ========== */
btnPlay.onclick = async () => {
  if (!provider || !signer || !userAddress) {
    alert("Sambungkan wallet dulu (Connect Wallet).");
    return;
  }

  // confirm display name exists
  const name = (displayNameInput.value || "").trim();
  if (!name) {
    alert("Isi Display Name terlebih dahulu (Max 12).");
    return;
  }
  localStorage.setItem(`displayName_${userAddress}`, name);

  // send on-chain start fee
  try {
    btnPlay.disabled = true;
    btnPlay.innerText = "Processing...";
    logAct("Sending start game TX...");

    const tx = await signer.sendTransaction({
      to: CONTRACT_LEADERBOARD,
      value: ethers.utils.parseEther(START_FEE)
    });

    logAct("TX sent: " + tx.hash);
    // wait 1 confirmation
    await tx.wait(1);
    logAct("Start game TX confirmed");

    // refresh balance then open play iframe
    await refreshBalance();

    // show play screen
    openPlayScreen();

    // notify iframe that on-chain payment success and game may start
    const payload = { type: "START_GAME_RESULT", success: true, txHash: tx.hash };
    try {
      gameFrame.contentWindow.postMessage(payload, "*");
    } catch (e) {
      console.warn("postMessage to iframe failed:", e);
    }

  } catch (err) {
    console.error("start tx error", err);
    alert("Start Game gagal / dibatalkan: " + (err && err.message ? err.message : ""));
    logAct("Start game failed");
  } finally {
    btnPlay.disabled = false;
    btnPlay.innerText = "PLAY (0.01 SOMI)";
  }
};

/* ========== IFRAME MESSAGING ========== */
function handleIframeMessage(ev) {
  if(!ev.data || !ev.data.type) return;

  if (ev.data.type === "REQUEST_CLAIM_SCORE") {
    // iframe sends: { type:"REQUEST_CLAIM_SCORE", score: N }
    const pts = Number(ev.data.score || 0);
    if (!userAddress) { logAct("Claim attempt but wallet not connected"); return; }

    // save accumulated score ON CLIENT (leaderboard local + onchain submit call could be added)
    savePlayerScore(userAddress, pts);
    logAct(`Claim received: ${shortAddr(userAddress)} +${pts} pts`);
    // reply back
    ev.source.postMessage({ type: "CLAIM_ACK", success: true }, ev.origin || "*");
    refreshLeaderboardUI();
  }
}

/* ========== LEADERBOARD STORAGE (local, per wallet) ========== */
function savePlayerScore(addr, pts){
  const key = "leaderboard_v1";
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  // find existing entry for addr
  const idx = arr.findIndex(x => x.wallet === addr);
  if (idx === -1) {
    arr.push({ wallet: addr, name: localStorage.getItem(`displayName_${addr}`) || shortAddr(addr), score: pts });
  } else {
    arr[idx].score = (arr[idx].score || 0) + pts;
    arr[idx].name = localStorage.getItem(`displayName_${addr}`) || arr[idx].name;
  }
  // sort desc
  arr.sort((a,b)=> (b.score||0) - (a.score||0));
  // keep top 100
  localStorage.setItem(key, JSON.stringify(arr.slice(0,100)));
}

/* ========== UI: open/close screens & leaderboard refresh ========== */
function openPlayScreen(){
  menuScreen.style.display = "none";
  leaderboardScreen.style.display = "none";
  playScreen.style.display = "flex";
  // set header name & addr
  playPlayerName.innerText = localStorage.getItem(`displayName_${userAddress}`) || "Player";
  playAddr.innerText = shortAddr(userAddress);
  // reload iframe to fresh state
  try { gameFrame.contentWindow.location.reload(); } catch(e){}
}

btnBackFromPlay.onclick = () => {
  // go back to menu: pause/stop iframe by reloading to a blank page to free resources
  try { gameFrame.contentWindow.postMessage({ type: "STOP_GAME" }, "*"); } catch(e){}
  // load blank then hide
  try { gameFrame.src = "about:blank"; } catch(e){}
  // small delay then restore frame src when returning to play
  setTimeout(()=>{ gameFrame.src = "Pacman/pacman_hybrid.html"; }, 200);
  playScreen.style.display = "none";
  menuScreen.style.display = "flex";
};

document.getElementById("btnLeaderboard").onclick = () => {
  menuScreen.style.display = "none";
  playScreen.style.display = "none";
  leaderboardScreen.style.display = "flex";
  refreshLeaderboardUI();
};

btnBackFromLb.onclick = () => {
  leaderboardScreen.style.display = "none";
  menuScreen.style.display = "flex";
};

document.getElementById("btnQuit").onclick = () => {
  window.open("about:blank","_self"); window.close();
};

function refreshLeaderboardUI() {
  const key = "leaderboard_v1";
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  leaderboardList.innerHTML = "";
  arr.slice(0,10).forEach((r,i) => {
    const li = document.createElement("li");
    li.innerText = `${i+1}. ${r.name || shortAddr(r.wallet)} — ${r.score} pts (${shortAddr(r.wallet)})`;
    leaderboardList.appendChild(li);
  });
}

/* ========== INIT (load saved displayName into input if generic) ========== */
window.addEventListener("load", async () => {
  // if any address saved previously, don't auto-connect; show local saved name placeholder
  const any = localStorage.getItem("displayName");
  if (any && !displayNameInput.value) displayNameInput.value = any;
  logAct("UI ready");
});

/* bind connect button */
btnConnect.onclick = connectWallet;

/* expose helper for iframe to request parent to start game (if desired) */
window.requestStartFromIframe = async function(){
  // same behavior as pressing PLAY
  return btnPlay.click();
};
