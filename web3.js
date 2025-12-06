/* web3.js — UNIVERSAL EVM WALLET SUPPORT (Metamask, Coinbase, Brave, WalletConnect...) */
/* REQUIREMENTS: ethers.min.js loaded first, config.js must define window.SOMNIA_CHAIN, window.SOMNIA_RPC, window.CONTRACTS.LEADERBOARD, window.ABI.LEADERBOARD */

console.log("🔌 web3.js loaded — universal provider support");

(async function () {
  if (!window.ethers) {
    console.error("ethers.js not found. Make sure libs/ethers.min.js is loaded before web3.js");
    return;
  }

  // ---------- internal state ----------
  const state = {
    providerCandidateList: [], // { name, provider (EIP-1193), meta }
    activeProvider: null,      // EIP-1193 provider object
    ethersProvider: null,      // ethers provider (Web3Provider or JsonRpcProvider)
    signer: null,
    address: null,
    contract: null,
    listeners: {}
  };

  // ---------- helpers ----------
  function log(...args) { console.log("[DreamWeb3]", ...args); }
  function warn(...args) { console.warn("[DreamWeb3]", ...args); }
  function err(...args) { console.error("[DreamWeb3]", ...args); }

  function emit(evt, data) {
    (state.listeners[evt] || []).forEach((cb) => {
      try { cb(data); } catch (e) { console.error("listener error", e); }
    });
  }

  // simple on/off
  function on(evt, cb) {
    state.listeners[evt] = state.listeners[evt] || [];
    state.listeners[evt].push(cb);
  }

  function off(evt, cb) {
    if (!state.listeners[evt]) return;
    state.listeners[evt] = state.listeners[evt].filter(x => x !== cb);
  }

  // ---------- detect injected providers ----------
  function probeInjectedProviders() {
    state.providerCandidateList = [];

    // EIP-1193 single provider
    if (window.ethereum) {
      // check if array of providers (some wallets inject an array)
      if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length) {
        window.ethereum.providers.forEach((p, i) => {
          let name = (p.isMetaMask && "MetaMask") || (p.isCoinbaseWallet && "Coinbase") || (p.isBraveWallet && "Brave") || ("Injected" + i);
          state.providerCandidateList.push({ name, provider: p, meta: {} });
        });
      } else {
        const p = window.ethereum;
        const name = (p.isMetaMask && "MetaMask") || (p.isCoinbaseWallet && "Coinbase") || (p.isBraveWallet && "Brave") || "Injected";
        state.providerCandidateList.push({ name, provider: p, meta: {} });
      }
    }

    // legacy web3
    if (window.web3 && window.web3.currentProvider) {
      state.providerCandidateList.push({ name: "LegacyWeb3", provider: window.web3.currentProvider, meta: {} });
    }

    // If none found, still keep list empty
    log("Detected providers:", state.providerCandidateList.map(p => p.name));
    return state.providerCandidateList;
  }

  // ---------- optional WalletConnect dynamic loader ----------
  // If user wants WalletConnect, they should add libs/walletconnect-provider.min.js into /libs
  // But code tries to dynamically load from unpkg if library not present (best to host locally).
  async function ensureWalletConnectAvailable() {
    if (window.WalletConnectProvider) return true;
    // try dynamic load (best-effort)
    try {
      const url = "https://unpkg.com/@walletconnect/web3-provider@1.8.0/dist/umd/index.min.js";
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      return !!window.WalletConnectProvider;
    } catch (e) {
      warn("WalletConnect provider script failed to load automatically. If you need WalletConnect, add libs/walletconnect-provider.min.js locally.");
      return false;
    }
  }

  // ---------- choose provider ----------
  async function chooseProviderByName(name) {
    // prefer injected providers with matching name
    const list = state.providerCandidateList;
    const found = list.find(x => x.name && x.name.toLowerCase().includes(name.toLowerCase()));
    if (found) {
      return setActiveProvider(found.provider, found.name);
    }
    // fallback to first injected
    if (list.length) return setActiveProvider(list[0].provider, list[0].name);
    // fallback to WalletConnect if available
    const wcAvailable = await ensureWalletConnectAvailable();
    if (wcAvailable) {
      return initWalletConnectProvider();
    }
    // fallback to JsonRpcProvider readonly
    return setReadOnlyProvider();
  }

  // ---------- set active provider (EIP-1193 provider object) ----------
  async function setActiveProvider(providerObj, nameHint) {
    try {
      state.activeProvider = providerObj;
      state.ethersProvider = new ethers.providers.Web3Provider(providerObj, "any");
      // create contract with signer only after connecting
      log("Active provider set:", nameHint || "injected");
      // attach events if available
      if (providerObj.on) {
        providerObj.on("accountsChanged", async (accounts) => {
          log("accountsChanged", accounts);
          state.address = accounts && accounts[0] ? accounts[0] : null;
          if (state.address) {
            state.signer = state.ethersProvider.getSigner();
            emit("connected", state.address);
          } else {
            emit("disconnected", null);
          }
        });
        providerObj.on("chainChanged", (chainId) => {
          log("chainChanged", chainId);
          emit("chainChanged", chainId);
        });
      }
      return true;
    } catch (e) {
      err("setActiveProvider error", e);
      return false;
    }
  }

  // ---------- WalletConnect init ----------
  async function initWalletConnectProvider(opts) {
    if (!await ensureWalletConnectAvailable()) return false;
    try {
      // eslint-disable-next-line no-undef
      const WalletConnectProvider = window.WalletConnectProvider.default || window.WalletConnectProvider;
      const wcProvider = new WalletConnectProvider({
        rpc: {
          // chainId decimal -> RPC URL
          // rely on window.SOMNIA_CHAIN.rpcUrls[0] (chainId decimal might be 5031)
          // WalletConnect expects chain id keys in decimal
          [parseInt(window.SOMNIA_CHAIN.chainId, 16)]: window.SOMNIA_CHAIN.rpcUrls[0]
        },
        qrcode: true
      });
      // enable will open QR modal and set provider
      await wcProvider.enable();
      return setActiveProvider(wcProvider, "WalletConnect");
    } catch (e) {
      err("initWalletConnectProvider error", e);
      return false;
    }
  }

  // ---------- read-only RPC fallback ----------
  function setReadOnlyProvider() {
    try {
      const rpc = window.SOMNIA_RPC || (window.SOMNIA_CHAIN && window.SOMNIA_CHAIN.rpcUrls && window.SOMNIA_CHAIN.rpcUrls[0]);
      if (!rpc) {
        warn("No RPC available for read-only provider");
        return false;
      }
      state.ethersProvider = new ethers.providers.JsonRpcProvider(rpc);
      state.activeProvider = null;
      state.signer = null;
      state.address = null;
      log("Using read-only RPC provider:", rpc);
      return true;
    } catch (e) {
      err("setReadOnlyProvider", e);
      return false;
    }
  }

  // ---------- ensure chain (switch/add) ----------
  async function ensureChain() {
    if (!state.activeProvider) {
      warn("No injected provider to switch chain. If using WalletConnect, it might already be on correct chain.");
      return false;
    }
    try {
      const chainId = await state.activeProvider.request({ method: "eth_chainId" });
      if (chainId === window.SOMNIA_CHAIN.chainId) return true;

      // try switch
      try {
        await state.activeProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: window.SOMNIA_CHAIN.chainId }]
        });
        return true;
      } catch (switchErr) {
        // if unrecognized, try add
        if (switchErr && switchErr.code === 4902) {
          await state.activeProvider.request({
            method: "wallet_addEthereumChain",
            params: [window.SOMNIA_CHAIN]
          });
          return true;
        }
        warn("wallet_switchEthereumChain failed:", switchErr);
        return false;
      }
    } catch (e) {
      warn("ensureChain error:", e);
      return false;
    }
  }

  // ---------- high level connect ----------
  async function connect(preferred) {
    probeInjectedProviders();

    // if preferred provided (string), try pick by name
    if (preferred) {
      const ok = await chooseProviderByName(preferred);
      if (!ok) {
        warn("Preferred provider not available, falling back");
        // continue
      }
    }

    // If no active provider yet, pick first injected or try WalletConnect or read-only
    if (!state.activeProvider && state.providerCandidateList.length > 0) {
      await setActiveProvider(state.providerCandidateList[0].provider, state.providerCandidateList[0].name);
    } else if (!state.activeProvider) {
      // try WalletConnect
      const wcok = await initWalletConnectProvider();
      if (!wcok) setReadOnlyProvider();
    }

    if (!state.activeProvider && !state.ethersProvider) {
      setReadOnlyProvider();
    }

    // If activeProvider exists, request accounts
    if (state.activeProvider) {
      try {
        await state.activeProvider.request({ method: "eth_requestAccounts" });
        state.ethersProvider = state.ethersProvider || new ethers.providers.Web3Provider(state.activeProvider, "any");
        state.signer = state.ethersProvider.getSigner();
        state.address = await state.signer.getAddress();
        log("Connected address:", state.address);
        // instantiate contract with signer if ABI & CONTRACT exist
        try {
          if (window.CONTRACTS && window.CONTRACTS.LEADERBOARD && window.ABI && window.ABI.LEADERBOARD) {
            state.contract = new ethers.Contract(window.CONTRACTS.LEADERBOARD, window.ABI.LEADERBOARD, state.signer);
          }
        } catch (cErr) { warn("contract instantiate failed", cErr); }

        emit("connected", state.address);
        // ensure chain
        await ensureChain();
        // refresh balances
        await refreshBalances();
        return state.address;
      } catch (e) {
        err("connect failed:", e);
        emit("error", e);
        return null;
      }
    } else {
      // read-only: can't connect accounts
      log("No injected provider (read-only)");
      emit("readonly");
      return null;
    }
  }

  // ---------- disconnect ----------
  async function disconnect() {
    try {
      if (state.activeProvider && state.activeProvider.disconnect) {
        try { await state.activeProvider.disconnect(); } catch (_) {}
      }
      state.activeProvider = null;
      state.ethersProvider = null;
      state.signer = null;
      state.address = null;
      state.contract = null;
      emit("disconnected");
      log("Disconnected");
    } catch (e) {
      warn("disconnect error", e);
    }
  }

  // ---------- balances ----------
  async function refreshBalances() {
    try {
      if (!state.ethersProvider) {
        setReadOnlyProvider();
      }
      if (!state.ethersProvider) return null;
      if (!state.address && state.signer) {
        state.address = await state.signer.getAddress().catch(()=>null);
      }
      const addr = state.address;
      if (!addr) {
        // just a read of provider native balance not possible without address
        return null;
      }
      const bal = await state.ethersProvider.getBalance(addr);
      emit("balance", { address: addr, balance: bal });
      return bal;
    } catch (e) {
      warn("refreshBalances error", e);
      return null;
    }
  }

  // ---------- startGame (on-chain) ----------
  async function startGame() {
    if (!state.contract || !state.signer) {
      err("startGame: contract or signer not ready");
      return { success: false, message: "Wallet/contract not ready" };
    }

    try {
      // read on-chain fee if available
      let fee;
      try {
        fee = await state.contract.startFeeWei();
      } catch (e) {
        // fallback default 0.01 if function not present
        fee = ethers.utils.parseEther("0.01");
      }

      // ensure balance
      const bal = await state.ethersProvider.getBalance(state.address);
      if (bal.lt(fee)) {
        const m = `Insufficient balance. Need ${ethers.utils.formatEther(fee)} SOMI`;
        warn(m);
        return { success:false, message: m };
      }

      // try normal call first, if estimate fails fallback to manual gasLimit
      try {
        const tx = await state.contract.startGame({ value: fee });
        log("startGame tx hash", tx.hash);
        await tx.wait(1);
        await refreshBalances();
        emit("startGameSuccess", tx.hash);
        return { success: true, txHash: tx.hash };
      } catch (e1) {
        warn("startGame direct call failed (estimate gas issue). Trying fallback gasLimit...", e1);
        try {
          const fallbackGas = 500000;
          const tx2 = await state.contract.startGame({ value: fee, gasLimit: fallbackGas });
          log("startGame tx hash (fallback)", tx2.hash);
          await tx2.wait(1);
          await refreshBalances();
          emit("startGameSuccess", tx2.hash);
          return { success: true, txHash: tx2.hash };
        } catch (e2) {
          err("startGame fallback failed", e2);
          return { success:false, message: e2 && e2.message ? e2.message : String(e2) };
        }
      }
    } catch (err) {
      err("startGame error", err);
      return { success:false, message: err && err.message ? err.message : String(err) };
    }
  }

  // ---------- submitScore ----------
  async function submitScore(score) {
    if (!state.contract || !state.signer) return { success:false, message: "Wallet/contract not ready" };
    try {
      const tx = await state.contract.submitScore(ethers.BigNumber.from(score), { gasLimit: 300000 });
      log("submitScore tx:", tx.hash);
      await tx.wait(1);
      emit("submitScoreSuccess", tx.hash);
      return { success:true, txHash: tx.hash };
    } catch (e) {
      err("submitScore error", e);
      return { success:false, message: e && e.message ? e.message : String(e) };
    }
  }

  // ---------- getTop10 (read-only) ----------
  async function getTop10() {
    try {
      // use read-only provider for reliability
      const rpc = window.SOMNIA_RPC || (window.SOMNIA_CHAIN && window.SOMNIA_CHAIN.rpcUrls && window.SOMNIA_CHAIN.rpcUrls[0]);
      const readProvider = new ethers.providers.JsonRpcProvider(rpc);
      const readContract = new ethers.Contract(window.CONTRACTS.LEADERBOARD, window.ABI.LEADERBOARD, readProvider);
      const res = await readContract.getTop10();
      // res: [addresses[], scores[]]
      return { success:true, players: res[0], scores: res[1] };
    } catch (e) {
      err("getTop10 error", e);
      return { success:false, message: e && e.message ? e.message : String(e) };
    }
  }

  // ---------- expose API ----------
  window.DreamWeb3 = {
    probeInjectedProviders,
    providers: () => state.providerCandidateList.map(p => p.name),
    connect,
    disconnect,
    chooseProviderByName,
    initWalletConnectProvider,
    ensureWalletConnectAvailable,
    setReadOnlyProvider,
    ensureChain,
    refreshBalances,
    startGame,
    submitScore,
    getTop10,
    on,
    off,
    _internalState: () => state // for debug
  };

  // auto-probe at load
  probeInjectedProviders();

  // bind default DOM connect button if present (#btnConnect or #btn-connect)
  const autoBtn = document.getElementById("btnConnect") || document.getElementById("btn-connect") || document.getElementById("btnConnectWallet");
  if (autoBtn) {
    autoBtn.addEventListener("click", async () => {
      // try connect with default injected, else WalletConnect
      const addr = await connect();
      if (addr) {
        log("Connected via UI:", addr);
      } else {
        warn("Connect returned null (read-only or failed)");
      }
    });
  }

  log("DreamWeb3 ready. Detected providers:", state.providerCandidateList.map(p => p.name));
})();
