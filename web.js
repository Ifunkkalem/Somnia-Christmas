// web3.js — production mainnet integration
(async()=>{
  // ensure ethers is present
  if (!window.ethers) {
    console.error("ethers not found. Pastikan libs/ethers.min.js ada.");
  }

  async function waitForEthereum(){
    return new Promise(resolve=>{
      if (window.ethereum) return resolve(window.ethereum);
      let tries=0; const t=setInterval(()=>{
        if(window.ethereum || tries>30){ clearInterval(t); resolve(window.ethereum); }
        tries++;
      },150);
    });
  }

  async function ensureChain(){
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId === window.SOMNIA_CHAIN.chainId) return true;
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: window.SOMNIA_CHAIN.chainId }]});
        return true;
      } catch (err) {
        if (err && err.code === 4902) {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [window.SOMNIA_CHAIN]});
          return true;
        }
        throw err;
      }
    } catch(e){
      console.error("ensureChain failed", e);
      return false;
    }
  }

  window.DreamWeb3 = {
    provider: null,
    signer: null,
    address: null,
    contract: null,

    async connect(){
      await waitForEthereum();
      if (!window.ethereum) { alert("MetaMask not found. Open in MetaMask browser."); return null; }

      const ok = await ensureChain();
      if (!ok) { alert("Gagal switch/add Somnia chain."); return null; }

      this.provider = new ethers.providers.Web3Provider(window.ethereum, "any");

      // listeners
      if (window.ethereum.on){
        window.ethereum.on("accountsChanged", async ()=>{ await this._onAccountsChanged(); });
        window.ethereum.on("chainChanged", async ()=>{ await this._onChainChanged(); });
      }

      try {
        await this.provider.send("eth_requestAccounts", []);
        this.signer = this.provider.getSigner();
        this.address = await this.signer.getAddress();

        // instantiate contract (with signer for write)
        this.contract = new ethers.Contract(window.CONTRACTS.LEADERBOARD, window.ABI.LEADERBOARD, this.signer);

        // update UI hook
        if (typeof window.afterWalletConnected === "function") {
          try { window.afterWalletConnected(this.address); } catch(e) {}
        }

        // refresh balances (optional)
        setTimeout(()=> this.refreshBalances(), 800);

        return this.address;
      } catch(e){
        console.error("connect error", e);
        alert("Gagal connect wallet.");
        return null;
      }
    },

    async _onAccountsChanged(){
      try {
        const accounts = await this.provider.send("eth_accounts", []);
        if (!accounts || accounts.length===0){
          this.address = null;
          if (typeof window.afterWalletConnected === "function") window.afterWalletConnected(null);
        } else {
          this.address = accounts[0];
          if (typeof window.afterWalletConnected === "function") window.afterWalletConnected(this.address);
          await this.refreshBalances();
        }
      } catch(e){ console.error(e); }
    },

    async _onChainChanged(){
      // reload page to simplify
      setTimeout(()=> location.reload(), 500);
    },

    async refreshBalances(){
      // minimal: fetch native balance
      try {
        if (!this.provider || !this.address) return;
        const bal = await this.provider.getBalance(this.address);
        const el = document.getElementById("addr-display");
        if (el) el.innerText = `${this.address} — ${Number(ethers.utils.formatEther(bal)).toFixed(4)} SOMI`;
      } catch(e){ console.warn("refreshBalances", e); }
    },

    // start game -> call contract.startGame() payable 0.01
    async startGame(){
      if (!this.contract || !this.signer) { alert("Wallet belum connect"); return false; }
      try {
        const fee = ethers.utils.parseEther("0.01");
        const tx = await this.contract.startGame({ value: fee, gasLimit: 300_000 });
        console.log("startGame tx:", tx.hash);
        await tx.wait(1);
        // refresh balances
        setTimeout(()=> this.refreshBalances(), 1200);
        return { success:true, txhash: tx.hash };
      } catch (err){
        console.error("startGame error", err);
        // bubble error message
        const msg = (err && err.message) ? err.message : String(err);
        return { success:false, error: msg };
      }
    },

    // submit score onchain
    async submitScore(score){
      if (!this.contract || !this.signer) { return { success:false, message:"Wallet not connected" }; }
      try {
        const tx = await this.contract.submitScore(ethers.BigNumber.from(score), { gasLimit: 300_000 });
        console.log("submitScore tx:", tx.hash);
        await tx.wait(1);
        return { success:true, txhash: tx.hash };
      } catch(err){
        console.error("submitScore error", err);
        return { success:false, message: (err && err.message) ? err.message : String(err) };
      }
    },

    // getTop10 (read-only)
    async getTop10(){
      if (!this.provider) {
        // create a read-only provider using RPC if available
        const rpc = window.SOMNIA_RPC;
        this.provider = new ethers.providers.JsonRpcProvider(rpc);
      }
      try {
        const readContract = new ethers.Contract(window.CONTRACTS.LEADERBOARD, window.ABI.LEADERBOARD, this.provider);
        const res = await readContract.getTop10();
        // res: [addresses[], scores[]]
        return { success:true, players: res[0], scores: res[1] };
      } catch(err){
        console.error("getTop10 error", err);
        return { success:false, message: (err && err.message)?err.message:String(err) };
      }
    }
  };

  // bind connect button if exists
  const btn = document.getElementById("btn-connect");
  if (btn) btn.addEventListener("click", ()=> DreamWeb3.connect());
})();
