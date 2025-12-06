// web3.js — FINAL (production-ready, Somnia Mainnet safe helpers)
// Requirements: libs/ethers.min.js loaded first, plus config vars:
// window.SOMNIA_CHAIN, window.SOMNIA_RPC (optional), window.CONTRACTS.LEADERBOARD,
// window.ABI.LEADERBOARD

(async () => {
  // check ethers availability
  if (!window.ethers) {
    console.error("ethers.js not found. Make sure libs/ethers.min.js is loaded before web3.js");
    return;
  }

  // small helpers
  function el(id) { return document.getElementById(id); }
  function shortAddr(a) { return a ? `${a.slice(0,6)}...${a.slice(-4)}` : "-"; }
  function logUI(msg) {
    const act = el("activityLog") || el("activity");
    if (act) {
      const t = new Date().toLocaleTimeString();
      act.textContent = `[${t}] ${msg}`;
    }
    console.log(msg);
  }

  async function waitForEthereum(timeoutTries = 30) {
    return new Promise((resolve) => {
      if (window.ethereum) return resolve(window.ethereum);
      let tries = 0;
      const t = setInterval(() => {
        if (window.ethereum || ++tries > timeoutTries) {
          clearInterval(t);
          resolve(window.ethereum);
        }
      }, 150);
    });
  }

  async function ensureChain() {
    if (!window.ethereum || !window.SOMNIA_CHAIN) return false;
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId === window.SOMNIA_CHAIN.chainId) return true;

      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: window.SOMNIA_CHAIN.chainId }]
        });
        return true;
      } catch (switchErr) {
        if (switchErr && switchErr.code === 4902) {
          // try add
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [window.SOMNIA_CHAIN]
            });
            return true;
          } catch (addErr) {
            console.error("wallet_addEthereumChain failed:", addErr);
            return false;
          }
        }
        console.error("wallet_switchEthereumChain failed:", switchErr);
        return false;
      }
    } catch (e) {
      console.error("ensureChain error:", e);
      return false;
    }
  }

  // create read provider (RPC) if provided
  const rpcUrl = window.SOMNIA_RPC || (window.SOMNIA_CHAIN && window.SOMNIA_CHAIN.rpcUrls && window.SOMNIA_CHAIN.rpcUrls[0]) || null;
  const readProvider = rpcUrl ? new ethers.providers.JsonRpcProvider(rpcUrl) : null;

  // Exported object
  window.DreamWeb3 = {
    provider: null,
    signer: null,
    address: null,
    contract: null,       // write-enabled contract (signer)
    readContract: null,   // read-only contract (provider)

    /* Connect */
    async connect() {
      await waitForEthereum();
      if (!window.ethereum) {
        alert("MetaMask / wallet not found. Open this page in wallet browser.");
        return null;
      }

      const chainOk = await ensureChain();
      if (!chainOk) {
        alert("Please add/switch to Somnia network in your wallet.");
        return null;
      }

      try {
        this.provider = new ethers.providers.Web3Provider(window.ethereum, "any");

        // register listeners
        if (window.ethereum.on) {
          window.ethereum.on("accountsChanged", async () => { await this._onAccountsChanged(); });
          window.ethereum.on("chainChanged", async () => { await this._onChainChanged(); });
        }

        await this.provider.send("eth_requestAccounts", []);
        this.signer = this.provider.getSigner();
        this.address = await this.signer.getAddress();

        // instantiate contract (write) if config present
        if (window.CONTRACTS && window.CONTRACTS.LEADERBOARD && window.ABI && window.ABI.LEADERBOARD) {
          try {
            this.contract = new ethers.Contract(window.CONTRACTS.LEADERBOARD, window.ABI.LEADERBOARD, this.signer);
          } catch (e) {
            console.warn("Failed to instantiate write contract:", e);
            this.contract = null;
          }
        } else {
          console.warn("CONTRACTS.LEADERBOARD or ABI.LEADERBOARD missing in config.js");
        }

        // instantiate read-only contract with readProvider if available
        if (readProvider && window.CONTRACTS && window.CONTRACTS.LEADERBOARD && window.ABI && window.ABI.LEADERBOARD) {
          try {
            this.readContract = new ethers.Contract(window.CONTRACTS.LEADERBOARD, window.ABI.LEADERBOARD, readProvider);
          } catch(e) {
            console.warn("Failed to instantiate read contract:", e);
            this.readContract = null;
          }
        } else {
          this.readContract = this.contract || null;
        }

        // UI updates
        const addrEl = el("addr-display") || el("addrDisplay");
        if (addrEl) addrEl.innerText = this.address;
        const ind = el("live-indicator");
        if (ind) { ind.classList.remove("offline"); ind.classList.add("online"); ind.innerText = "ONLINE"; }
        logUI("Wallet connected: " + this.address);

        // call hook if exists
        if (typeof window.afterWalletConnected === "function") {
          try { window.afterWalletConnected(this.address); } catch(e) { console.warn(e); }
        }

        // refresh balances
        setTimeout(() => this.refreshBalances(), 600);
        return this.address;
      } catch (err) {
        console.error("connect error:", err);
        alert("Failed to connect wallet: " + (err && err.message ? err.message : String(err)));
        return null;
      }
    },

    /* Internal: accounts changed */
    async _onAccountsChanged() {
      try {
        if (!this.provider) return;
        const accounts = await this.provider.send("eth_accounts", []);
        if (!accounts || accounts.length === 0) {
          this.address = null;
          const addrEl = el("addr-display") || el("addrDisplay");
          if (addrEl) addrEl.innerText = "Not connected";
          const ind = el("live-indicator");
          if (ind) { ind.classList.remove("online"); ind.classList.add("offline"); ind.innerText = "OFFLINE"; }
          if (typeof window.afterWalletConnected === "function") window.afterWalletConnected(null);
        } else {
          this.address = accounts[0];
          if (typeof window.afterWalletConnected === "function") window.afterWalletConnected(this.address);
          await this.refreshBalances();
        }
      } catch (e) {
        console.error("_onAccountsChanged error:", e);
      }
    },

    async _onChainChanged() {
      // simple reload so UI and providers align
      setTimeout(() => location.reload(), 400);
    },

    /* Refresh native balance */
    async refreshBalances() {
      try {
        if (!this.provider || !this.address) {
          const bEl = el("balance-stt") || el("balanceSomi");
          if (bEl) bEl.innerText = "-";
          return;
        }
        const bal = await this.provider.getBalance(this.address);
        const bEl = el("balance-stt") || el("balanceSomi");
        if (bEl) bEl.innerText = Number(ethers.utils.formatEther(bal)).toFixed(4);
      } catch (e) {
        console.warn("refreshBalances error:", e);
      }
    },

    /* START GAME (on-chain) - robust checks + user-friendly messages
       logic:
       1. ensure contract present
       2. read startFeeWei() via readContract or contract
       3. read players(address) to check lastPlayed (if locked)
       4. check balance
       5. attempt to send tx: first try normal, if estimateGas fails try fallback gasLimit
    */
    async startGame() {
      if (!this.signer) {
        alert("Wallet not connected.");
        return { success: false, error: "wallet_not_connected" };
      }
      if (!this.contract && !this.readContract) {
        alert("Leaderboard contract not configured.");
        return { success: false, error: "contract_missing" };
      }

      try {
        // read startFee from contract (prefer readContract)
        let fee;
        try {
          const rc = this.readContract || this.contract;
          fee = await rc.startFeeWei();
        } catch (readErr) {
          console.warn("Cannot read startFeeWei() from contract, fallback to 0.01 SOMI", readErr);
          fee = ethers.utils.parseEther("0.01");
        }

        // check player state (lastPlayed) to detect locked session
        try {
          const rc = this.readContract || this.contract;
          if (rc && rc.players) {
            // players(address) returns struct (totalScore, lastPlayed)
            const p = await rc.players(this.address);
            // lastPlayed likely 0 if not playing
            const lastPlayed = p && p.lastPlayed ? p.lastPlayed.toNumber ? Number(p.lastPlayed) : Number(p.lastPlayed) : 0;
            if (lastPlayed && lastPlayed !== 0) {
              // still in-game (not submitted)
              const msg = "You appear to have an active game (not submitted). Please submit score or wait before starting a new game.";
              alert(msg);
              return { success: false, error: "player_locked", message: msg };
            }
          }
        } catch (pErr) {
          console.warn("Cannot read players() state:", pErr);
        }

        // check balance
        const bal = await this.provider.getBalance(this.address);
        if (bal.lt(fee)) {
          const msg = `Insufficient balance. Need ${ethers.utils.formatEther(fee)} SOMI.`;
          alert(msg);
          return { success: false, error: "insufficient_balance", message: msg };
        }

        // attempt tx
        let tx;
        try {
          // try calling without explicit gasLimit first (lets provider estimate)
          tx = await this.contract.startGame({ value: fee });
        } catch (estErr) {
          // common: UNPREDICTABLE_GAS_LIMIT or execution reverted during estimate
          console.warn("startGame estimate failed, trying fallback gasLimit (500k).", estErr);
          try {
            tx = await this.contract.startGame({ value: fee, gasLimit: 500000 });
          } catch (fallbackErr) {
            console.error("Fallback startGame failed:", fallbackErr);
            // show user readable revert reason if present
            const msg = (fallbackErr && fallbackErr.error && fallbackErr.error.message) ? fallbackErr.error.message :
                        (fallbackErr && fallbackErr.message) ? fallbackErr.message : String(fallbackErr);
            alert("Start Game failed: " + msg);
            return { success: false, error: "tx_failed", message: msg };
          }
        }

        logUI("startGame tx submitted: " + tx.hash);
        // wait 1 confirmation
        await tx.wait(1);
        logUI("startGame confirmed: " + tx.hash);
        // refresh balance after tx
        setTimeout(() => this.refreshBalances(), 800);
        return { success: true, txHash: tx.hash };

      } catch (e) {
        console.error("startGame unexpected error:", e);
        const msg = e && e.message ? e.message : String(e);
        alert("Start Game error: " + msg);
        return { success: false, error: "unexpected", message: msg };
      }
    },

    /* submitScore(score) on-chain */
    async submitScore(score) {
      if (!this.signer || !this.contract) {
        return { success: false, message: "Wallet/Contract not ready" };
      }
      try {
        // ensure score not exceed max (try to read maxScorePerSubmit)
        try {
          const max = await (this.readContract || this.contract).maxScorePerSubmit();
          if (max && ethers.BigNumber.isBigNumber(max) && ethers.BigNumber.from(score).gt(max)) {
            return { success: false, message: `Score too high. Max allowed ${max.toString()}` };
          }
        } catch (e) {
          // ignore read error
        }

        const tx = await this.contract.submitScore(ethers.BigNumber.from(score), { gasLimit: 300000 });
        logUI("submitScore tx: " + tx.hash);
        await tx.wait(1);
        logUI("submitScore confirmed: " + tx.hash);
        return { success: true, txHash: tx.hash };
      } catch (err) {
        console.error("submitScore error:", err);
        return { success: false, message: (err && err.message) ? err.message : String(err) };
      }
    },

    /* read-only getTop10 (uses readProvider if available) */
    async getTop10() {
      try {
        const rc = this.readContract || this.contract;
        if (!rc) throw new Error("Read contract not configured");
        const res = await rc.getTop10();
        // res = [addresses[], scores[]]
        return { success: true, players: res[0], scores: res[1] };
      } catch (err) {
        console.error("getTop10 error:", err);
        return { success: false, message: (err && err.message) ? err.message : String(err) };
      }
    },

    /* convenience: disconnect (not always possible) */
    async disconnect() {
      // simply clear local JS state; wallet provider remains
      this.address = null;
      this.signer = null;
      this.provider = null;
      this.contract = null;
      const addrEl = el("addr-display") || el("addrDisplay");
      if (addrEl) addrEl.innerText = "Not connected";
      const ind = el("live-indicator");
      if (ind) { ind.classList.remove("online"); ind.classList.add("offline"); ind.innerText = "OFFLINE"; }
      logUI("Disconnected (client-side)");
    }
  }; // end DreamWeb3

  // bind connect button (if exists)
  const btnA = el("btn-connect") || el("btnConnect");
  if (btnA) btnA.addEventListener("click", () => window.DreamWeb3.connect());

  // debug exposure
  console.log("DreamWeb3 initialized:", !!window.DreamWeb3);
})();
