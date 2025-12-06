// web3.js — Somnia Mainnet FIXED GLOBAL

(function () {
  if (!window.ethers) {
    alert("ethers.js belum termuat!");
    return;
  }

  console.log("✅ web3.js loaded");

  window.DreamWeb3 = {
    provider: null,
    signer: null,
    address: null,
    contract: null,

    async connect() {
      if (!window.ethereum) {
        alert("MetaMask tidak ditemukan.");
        return null;
      }

      await window.ethereum.request({ method: "eth_requestAccounts" });

      this.provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      this.signer = this.provider.getSigner();
      this.address = await this.signer.getAddress();

      this.contract = new ethers.Contract(
        window.CONTRACTS.LEADERBOARD,
        window.ABI.LEADERBOARD,
        this.signer
      );

      console.log("✅ DreamWeb3 Connected:", this.address);
      return this.address;
    },

    async startGame() {
      if (!this.contract) {
        alert("Wallet belum connect");
        return;
      }

      try {
        const tx = await this.contract.startGame({
          value: ethers.utils.parseEther("0.01"),
          gasLimit: 300000,
        });

        console.log("✅ startGame tx:", tx.hash);
        await tx.wait();
        return tx.hash;
      } catch (e) {
        console.error("❌ startGame error:", e);
        throw e;
      }
    },

    async submitScore(score) {
      if (!this.contract) {
        alert("Wallet belum connect");
        return;
      }

      try {
        const tx = await this.contract.submitScore(score, {
          gasLimit: 300000,
        });

        console.log("✅ submitScore tx:", tx.hash);
        await tx.wait();
        return tx.hash;
      } catch (e) {
        console.error("❌ submitScore error:", e);
        throw e;
      }
    },

    async getTop10() {
      try {
        const provider = new ethers.providers.JsonRpcProvider(window.SOMNIA_RPC);
        const read = new ethers.Contract(
          window.CONTRACTS.LEADERBOARD,
          window.ABI.LEADERBOARD,
          provider
        );

        return await read.getTop10();
      } catch (e) {
        console.error("❌ getTop10 error:", e);
        return null;
      }
    },
  };

  console.log("✅ window.DreamWeb3 READY");
})();
