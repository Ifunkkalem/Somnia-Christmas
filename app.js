// ================= CONFIG =================
const SOMNIA_CHAIN = {
  chainId: "0x13a7",
  chainName: "Somnia Mainnet",
  nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
  rpcUrls: ["https://api.infra.mainnet.somnia.network"]
};

const CONTRACT_LEADERBOARD = "0xD76b767102f2610b0C97FEE84873c1fAA4c7C365";
const START_FEE = "0.01";

// ================= STATE =================
let provider, signer, userAddress;

// ================= UI ELEMENTS =================
const btnConnect = document.getElementById("btnConnect");
const addrDisplay = document.getElementById("addrDisplay");
const balanceSomi = document.getElementById("balanceSomi");
const btnPlay = document.getElementById("btnPlay");
const btnSaveName = document.getElementById("btnSaveName");
const nameInput = document.getElementById("displayNameInput");
const menuScreen = document.getElementById("menuScreen");
const playScreen = document.getElementById("playScreen");
const gameFrame = document.getElementById("gameFrame");
const btnBackFromPlay = document.getElementById("btnBackFromPlay");
const activityLog = document.getElementById("activityLog");
const playPlayerName = document.getElementById("playPlayerName");
const playAddr = document.getElementById("playAddr");

// ================= HELPERS =================
function log(msg){
  const t = new Date().toLocaleTimeString();
  activityLog.innerText = `[${t}] ${msg}`;
  console.log(msg);
}

function shortAddr(a){
  return a.slice(0,6)+"..."+a.slice(-4);
}

// ================= WALLET CONNECT =================
btnConnect.onclick = async ()=>{
  if (!window.ethereum) {
    alert("Buka pakai MetaMask Browser / Web3 Browser");
    return;
  }

  try {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");

    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== SOMNIA_CHAIN.chainId) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [SOMNIA_CHAIN]
      });
    }

    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    // ✅ UPDATE STATUS ATAS
    addrDisplay.innerText = shortAddr(userAddress);
    btnConnect.innerText = "Connected";
    btnConnect.disabled = true;

    // ✅ UPDATE SALDO
    const bal = await provider.getBalance(userAddress);
    balanceSomi.innerText = Number(ethers.utils.formatEther(bal)).toFixed(4);

    // ✅ LOAD NAME
    const saved = localStorage.getItem("name_" + userAddress);
    if (saved) nameInput.value = saved;

    log("Wallet connected");

  } catch (err){
    console.error(err);
    alert("Gagal connect wallet");
  }
};

// ================= SAVE NAME =================
btnSaveName.onclick = ()=>{
  if (!userAddress) {
    alert("Connect wallet dulu");
    return;
  }

  const name = nameInput.value.trim();
  if (!name || name.length > 12) {
    alert("Nama 1–12 karakter");
    return;
  }

  localStorage.setItem("name_" + userAddress, name);
  alert("Nama disimpan");
};

// ================= PLAY GAME =================
btnPlay.onclick = async () => {
  if (!provider || !signer || !userAddress) {
    alert("Connect wallet dulu.");
    return;
  }

  try {
    btnPlay.disabled = true;
    btnPlay.innerText = "Processing...";

    const contract = new ethers.Contract(
      CONTRACT_LEADERBOARD,
      window.ABI.LEADERBOARD,
      signer
    );

    // ✅ AMBIL STARTFEE LANGSUNG DARI CHAIN
    const startFee = await contract.startFeeWei();
    console.log("START FEE ONCHAIN:", startFee.toString());

    const bal = await provider.getBalance(userAddress);
    if (bal.lt(startFee)) {
      alert("Saldo SOMI tidak cukup.");
      btnPlay.disabled = false;
      btnPlay.innerText = "PLAY (0.01 SOMI)";
      return;
    }

    // ✅ HARD GAS BYPASS ESTIMATE
    const tx = await contract.startGame({
      value: startFee,
      gasLimit: 350000
    });

    logAct("TX sent: " + tx.hash);

    await tx.wait(1);

    logAct("Game started!");
    await refreshBalance();
    openPlayScreen();

  } catch (err) {
    console.error("START GAME ERROR:", err);
    alert("TX gagal: kemungkinan fee tidak cocok / cooldown aktif.");
  } finally {
    btnPlay.disabled = false;
    btnPlay.innerText = "PLAY (0.01 SOMI)";
  }
};

    // ✅ UPDATE SALDO SETELAH TX
    const bal = await provider.getBalance(userAddress);
    balanceSomi.innerText = Number(ethers.utils.formatEther(bal)).toFixed(4);

    openPlay();
    log("TX Success, game started");

  } catch(e){
    console.error(e);
    alert("TX dibatalkan / gagal");
  }
};

// ================= SCREEN CONTROL =================
function openPlay(){
  menuScreen.style.display = "none";
  playScreen.style.display = "flex";
  playPlayerName.innerText = nameInput.value || "Player";
  playAddr.innerText = shortAddr(userAddress);

  // ✅ RELOAD IFRAME AGAR TIDAK HITAM
  gameFrame.src = "Pacman/pacman_hybrid.html?ts=" + Date.now();
}

btnBackFromPlay.onclick = ()=>{
  gameFrame.src = "about:blank";
  playScreen.style.display = "none";
  menuScreen.style.display = "flex";
};
