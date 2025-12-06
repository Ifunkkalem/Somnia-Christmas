// web3.js — FINAL (Somnia Mainnet safe startGame + helpers)
// Pastikan window.SOMNIA_CHAIN, window.SOMNIA_RPC (optional), window.CONTRACTS.LEADERBOARD dan window.ABI.LEADERBOARD
// sudah didefinisikan (dari config.js)

(async () => {
  if (!window.ethers) {
    console.error("ethers.js tidak ditemukan. Pastikan libs/ethers.min.js diload sebelum web3.js");
    return;
  }

  async function waitForEthereum() {
    return new Promise((resolve) => {
      if (window.ethereum) return resolve(window.ethereum);
      let tries = 0;
      const t = setInterval(() => {
        if (window.ethereum || ++tries > 30) {
          clearInterval(t);
          resolve(window.ethereum);
        }
      }, 150);
    });
  }

  async function ensureSomniaChain() {
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
          // chain unknown -> add
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [window.SOMNIA_CHAIN]
          });
          return true;
        }
        console.error("wallet_switchEthereumChain failed:", switchErr);
        return false;
      }
    } catch (e) {
      console.error("ensureSomniaChain error:", e);
      return false;
    }
  }

  // Main object exported to window
  window.DreamWeb3 = {
    provider: null,
    signer: null,
    address: null,
    contract: null, // write-enabled contract instance (signer)

    async connect() {
      await waitForEthereum();
      if (!window.ethereum) {
        alert("MetaMask / wallet tidak ditemukan. Buka halaman ini lewat MetaMask atau browser dengan wallet.");
        return null;
      }

      const okChain = await ensureSomniaChain();
      if (!okChain) {
        alert("Gagal switch / add Somnia chain. Cek MetaMask.");
        return null;
      }

      try {
        this.provider = new ethers.providers.Web3Provider(window.ethereum, "any");

        // register listeners (safe)
        if (window.ethereum.on) {
          window.ethereum.on("accountsChanged", async () => await this._onAccountsChanged());
          window.ethereum.on("chainChanged", async () => await this._onChainChanged());
        }

        await this.provider.send("eth_requestAccounts", []);
        this.signer = this.provider.getSigner();
        this.address = await this.signer.getAddress();

        // instantiate contract with signer for writes
        if (!window.CONTRACTS || !window.CONTRACTS.LEADERBOARD) {
          console.warn("window.CONTRACTS.LEADERBOARD tidak ditemukan di config.js");
        } else {
          try {
            this.contract = new ethers.Contract(
              window.CONTRACTS.LEADERBOARD,
              window.ABI.LEADERBOARD,
              this.signer
            );
          } catch (cErr) {
            console.warn("Gagal instantiate contract (write):", cErr);
            this.contract = null;
          }
        }

        // UI updates (if element exists)
        const addrEl = document.getElementById("addr-display") || document.getElementById("addrDisplay");
        if (addrEl) addrEl.innerText = this.address;

        const ind = document.getElementById("live-indicator");
        if (ind) {
          ind.classList.remove("offline");
          ind.classList.add("online");
          ind.innerText = "ONLINE";
        }

        // call optional hook
        if (typeof window.afterWalletConnected === "function") {
          try { window.afterWalletConnected(this.address); } catch (e) { console.warn(e); }
        }

        // refresh balances shortly
        setTimeout(() => this.refreshBalances(), 800);
        return this.address;
      } catch (err) {
        console.error("Connect error:", err);
        alert("Gagal menghubungkan wallet: " + (err && err.message ? err.message : ""));
        return null;
      }
    },

    async _onAccountsChanged() {
      try {
        const accounts = await this.provider.send("eth_accounts", []);
        if (!accounts || accounts.length === 0) {
          this.address = null;
          const addrEl = document.getElementById("addr-display") || document.getElementById("addrDisplay");
          if (addrEl) addrEl.innerText = "Not connected";
          const ind = document.getElementById("live-indicator");
          if (ind) { ind.classList.remove("online"); ind.classList.add("offline"); ind.innerText = "OFFLINE"; }
          if (typeof window.afterWalletConnected === "function") window.afterWalletConnected(null);
        } else {
          this.address = accounts[0];
          if (typeof window.afterWalletConnected === "function") window.afterWalletConnected(this.address);
          await this.refreshBalances();
        }
      } catch (e) {
        console.error("onAccountsChanged error:", e);
      }
    },

    async _onChainChanged() {
      // safer: reload page (simple)
      setTimeout(() => location.reload(), 400);
    },

    async refreshBalances() {
      if (!this.provider || !this.address) {
        const stEl = document.getElementById("balance-stt") || document.getElementById("balanceSomi");
        if (stEl) stEl.innerText = "-";
        return;
      }
      try {
        const bal = await this.provider.getBalance(this.address);
        const el = document.getElementById("balance-stt") || document.getElementById("balanceSomi");
        if (el) el.innerText = Number(ethers.utils.formatEther(bal)).toFixed(4);
      } catch (e) {
        console.warn("refreshBalances error:", e);
      }
    },

    // START GAME: safer flow to avoid unpredictable gas where possible
    async startGame() {
  if (!this.contract || !this.signer) {
    alert("Wallet belum siap.");
    return;
  }

  try {
    const net = await this.provider.getNetwork();
    const hex = "0x" + net.chainId.toString(16);

    if (hex.toLowerCase() !== window.SOMNIA_CHAIN.chainId.toLowerCase()) {
      alert("Harap pindah ke Somnia Mainnet!");
      return;
    }

    // =========================
    // AMBIL FEE ASLI DARI CHAIN
    // =========================
    let fee = await this.contract.startFeeWei();

    // =========================
    // AMBIL SALDO
    // =========================
    const bal = await this.provider.getBalance(this.address);
    if (bal.lt(fee)) {
      alert("Saldo SOMI tidak cukup.");
      return;
    }

    // =========================
    // GAS FIX HARD
    // =========================
    const gasPrice = await this.provider.getGasPrice();

    const tx = await this.contract.startGame({
      value: fee,
      gasLimit: 350000,   // HARD LIMIT ✅
      gasPrice            // HARD GASPRICE ✅
    });

    console.log("TX sent:", tx.hash);
    document.getElementById("activityLog").textContent = "TX sent..." ;

    await tx.wait(1);

    document.getElementById("activityLog").textContent = "Game started!";
    await this.refreshBalances();

    return tx.hash;

  } catch (e) {
    console.error("startGame failed:", e);
    alert("TX gagal dikirim. RPC sedang error, coba ulang.");
  }
    }

      try {
        // 1) baca fee on-chain (function name: startFeeWei)
        let fee;
        try {
          fee = await this.contract.startFeeWei();
        } catch (readErr) {
          console.warn("Gagal baca startFeeWei() dari kontrak, fallback ke 0.01:", readErr);
          fee = ethers.utils.parseEther("0.01");
        }

        // 2) cek saldo user cukup
        const bal = await this.provider.getBalance(this.address);
        if (bal.lt(fee)) {
          const msg = `STT tidak cukup (butuh ${ethers.utils.formatEther(fee)} SOMI).`;
          alert(msg);
          return { success: false, error: "insufficient_balance", message: msg };
        }

        // 3) try estimate gas (readable) — jika gagal, fallback ke gasLimit manual
        let tx;
        try {
          // call startGame with an explicit value
          tx = await this.contract.startGame({ value: fee });
          // jika gas estimation ok, contract lib biasanya mengestimasinya sendiri
        } catch (e) {
          // common: provider throws UNPREDICTABLE_GAS_LIMIT or execution reverted during estimate
          console.warn("Direct contract.startGame() failed (likely estimateGas). Will try manual gasLimit fallback.", e);
          try {
            const fallbackGas = 500000; // safe fallback
            tx = await this.contract.startGame({ value: fee, gasLimit: fallbackGas });
          } catch (e2) {
            console.error("Fallback startGame also failed:", e2);
            // more detail to user
            const msg = e2 && e2.message ? e2.message : String(e2);
            alert("Start Game gagal: " + msg);
            return { success: false, error: "tx_failed", message: msg };
          }
        }

        console.log("startGame tx submitted:", tx.hash);
        // wait 1 confirmation
        await tx.wait(1);
        // refresh balances
        setTimeout(() => this.refreshBalances(), 1200);
        return { success: true, txHash: tx.hash };

      } catch (err) {
        console.error("startGame final error:", err);
        const msg = err && err.message ? err.message : String(err);
        alert("Start Game gagal: " + msg);
        return { success: false, error: "unknown", message: msg };
      }
    },

    // submitScore wrapper (on-chain)
    async submitScore(score) {
      if (!this.contract || !this.signer) {
        return { success: false, message: "Wallet/contract not ready" };
      }
      try {
        const tx = await this.contract.submitScore(ethers.BigNumber.from(score), { gasLimit: 300000 });
        await tx.wait(1);
        return { success: true, txHash: tx.hash };
      } catch (err) {
        console.error("submitScore error:", err);
        return { success: false, message: err && err.message ? err.message : String(err) };
      }
    },

    // read-only top10 (uses RPC provider if no signer)
    async getTop10() {
      try {
        const rpc = window.SOMNIA_RPC || (window.SOMNIA_CHAIN && window.SOMNIA_CHAIN.rpcUrls && window.SOMNIA_CHAIN.rpcUrls[0]);
        const readProvider = this.provider ? this.provider : (rpc ? new ethers.providers.JsonRpcProvider(rpc) : null);
        if (!readProvider) throw new Error("No provider for read");
        const readContract = new ethers.Contract(window.CONTRACTS.LEADERBOARD, window.ABI.LEADERBOARD, readProvider);
        const res = await readContract.getTop10();
        return { success: true, players: res[0], scores: res[1] };
      } catch (err) {
        console.error("getTop10 error:", err);
        return { success: false, message: err && err.message ? err.message : String(err) };
      }
    }
  };

  // bind UI connect button if present
  const btn = document.getElementById("btn-connect") || document.getElementById("btnConnect");
  if (btn) btn.addEventListener("click", () => DreamWeb3.connect());
})();
