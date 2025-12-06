// ui-check-player.js — Read players(address) status safely
// Requires: ethers.min.js, config.js (SOMNIA_RPC, CONTRACTS, ABI), web3.js

(async () => {
  if (!window.ethers) {
    console.error("ethers.js not found");
    return;
  }

  const rpcUrl =
    window.SOMNIA_RPC ||
    (window.SOMNIA_CHAIN &&
      window.SOMNIA_CHAIN.rpcUrls &&
      window.SOMNIA_CHAIN.rpcUrls[0]);

  if (!rpcUrl) {
    console.warn("No RPC available for read-only player check.");
    return;
  }

  if (!window.CONTRACTS || !window.CONTRACTS.LEADERBOARD) {
    console.warn("CONTRACTS.LEADERBOARD not defined.");
    return;
  }

  if (!window.ABI || !window.ABI.LEADERBOARD) {
    console.warn("ABI.LEADERBOARD not defined.");
    return;
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const readContract = new ethers.Contract(
    window.CONTRACTS.LEADERBOARD,
    window.ABI.LEADERBOARD,
    provider
  );

  // ✅ GLOBAL FUNCTION
  window.checkPlayerStatus = async function (address) {
    try {
      if (!address) {
        if (window.DreamWeb3 && DreamWeb3.address) {
          address = DreamWeb3.address;
        } else {
          alert("Wallet belum connect dan address tidak diberikan.");
          return;
        }
      }

      const p = await readContract.players(address);

      const totalScore = p.totalScore
        ? p.totalScore.toString()
        : "0";

      const lastPlayed = p.lastPlayed
        ? p.lastPlayed.toString()
        : "0";

      const locked = lastPlayed !== "0";

      console.log("====== PLAYER STATUS ======");
      console.log("Address     :", address);
      console.log("Total Score :", totalScore);
      console.log("Last Played :", lastPlayed);
      console.log("Status      :", locked ? "🟡 ACTIVE / LOCKED" : "🟢 FREE");
      console.log("===========================");

      // Optional UI output
      const out = document.getElementById("player-status");
      if (out) {
        out.innerHTML = `
          <div>Address: ${address}</div>
          <div>Total Score: ${totalScore}</div>
          <div>Last Played: ${lastPlayed}</div>
          <div>Status: ${locked ? "ACTIVE / LOCKED" : "FREE"}</div>
        `;
      }

      return {
        address,
        totalScore,
        lastPlayed,
        locked
      };

    } catch (e) {
      console.error("checkPlayerStatus failed:", e);
      alert("Gagal membaca status player dari kontrak.");
      return null;
    }
  };

  console.log("✅ checkPlayerStatus(address) ready");
})();
