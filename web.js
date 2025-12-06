console.log("✅ web3.js terload");
(async () => {
  if (!window.ethereum) {
    alert("MetaMask tidak terdeteksi.");
    return;
  }

  if (!window.ethers) {
    alert("ethers.js belum dimuat.");
    return;
  }

  window.DreamWeb3 = {
    provider: null,
    signer: null,
    address: null,
    contract: null,

    async connect() {
      try {
        // Request wallet
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        await this.provider.send("eth_requestAccounts", []);

        // Network check
        const net = await this.provider.getNetwork();
        if ("0x" + net.chainId.toString(16) !== window.SOMNIA_CHAIN.chainId) {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: window.SOMNIA_CHAIN.chainId }]
          });
        }

        this.signer = this.provider.getSigner();
        this.address = await this.signer.getAddress();

        this.contract = new ethers.Contract(
          window.CONTRACTS.LEADERBOARD,
          window.ABI.LEADERBOARD,
          this.signer
        );

        // Update UI
        const addr = document.getElementById("addrDisplay");
        if (addr) addr.innerText = this.address;

        const bal = await this.provider.getBalance(this.address);
        const balEl = document.getElementById("balanceSomi");
        if (balEl)
          balEl.innerText = Number(ethers.utils.formatEther(bal)).toFixed(4);

        console.log("✅ Wallet connected:", this.address);
        return this.address;

      } catch (e) {
        console.error("❌ Connect error:", e);
        alert("Gagal connect wallet.");
      }
    }
  };

  // BUTTON CONNECT
  const btn = document.getElementById("btnConnect");
  if (btn) {
    btn.onclick = () => window.DreamWeb3.connect();
  }

})();
