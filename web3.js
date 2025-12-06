// ✅ web3.js — UNIVERSAL EVM WALLET (Somnia Mainnet)

console.log("✅ web3.js loaded");

(function () {
  if (typeof window.ethereum === "undefined") {
    alert("Wallet EVM tidak ditemukan!");
    return;
  }

  if (!window.ethers) {
    alert("ethers.js tidak terload!");
    return;
  }

  window.DreamWeb3 = {
    provider: null,
    signer: null,
    address: null,
    contract: null,

    async connect() {
      try {
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        await this.provider.send("eth_requestAccounts", []);
        this.signer = this.provider.getSigner();
        this.address = await this.signer.getAddress();

        // ✅ FORCE ke Somnia
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (chainId !== window.SOMNIA_CHAIN.chainId) {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: window.SOMNIA_CHAIN.chainId }]
          });
        }

        this.contract = new ethers.Contract(
          window.CONTRACTS.LEADERBOARD,
          window.ABI.LEADERBOARD,
          this.signer
        );

        console.log("✅ Wallet Connected:", this.address);

        document.getElementById("addrDisplay").innerText =
          this.address.slice(0, 6) + "..." + this.address.slice(-4);

        await this.refreshBalance();

        return this.address;
      } catch (e) {
        console.error("❌ Connect error:", e);
        alert("Gagal connect wallet");
      }
    },

    async refreshBalance() {
      const bal = await this.provider.getBalance(this.address);
      document.getElementById("balanceSomi").innerText =
        Number(ethers.utils.formatEther(bal)).toFixed(4);
    },

    // ✅ START GAME RESMI ON-CHAIN
    async startGame() {
      try {
        const fee = await this.contract.startFeeWei();
        const tx = await this.contract.startGame({
          value: fee,
          gasLimit: 300000
        });

        document.getElementById("activityLog").innerText = "TX Sent...";
        await tx.wait(1);
        document.getElementById("activityLog").innerText = "✅ Game Started";

        await this.refreshBalance();
        return tx.hash;
      } catch (e) {
        console.error("❌ startGame error:", e);
        alert("TX gagal / user cancel");
      }
    },

    async submitScore(score) {
      try {
        const tx = await this.contract.submitScore(score, { gasLimit: 300000 });
        await tx.wait(1);
        alert("✅ Score submitted on-chain");
      } catch (e) {
        console.error("❌ submitScore error:", e);
        alert("Submit gagal");
      }
    }
  };

  // ✅ AUTO BIND BUTTON CONNECT
  const btn = document.getElementById("btnConnect");
  if (btn) btn.onclick = () => window.DreamWeb3.connect();

})();
