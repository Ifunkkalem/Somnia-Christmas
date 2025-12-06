(async () => {

  if (!window.ethereum) {
    alert("MetaMask tidak ditemukan!");
    return;
  }

  let provider, signer, userAddress, contract;

  const btnConnect = document.getElementById("btnConnect");
  const btnPlay = document.getElementById("btnPlay");
  const btnSaveName = document.getElementById("btnSaveName");
  const displayNameInput = document.getElementById("displayNameInput");
  const menuScreen = document.getElementById("menuScreen");
  const playScreen = document.getElementById("playScreen");
  const leaderboardScreen = document.getElementById("leaderboardScreen");
  const gameFrame = document.getElementById("gameFrame");
  const btnBackFromPlay = document.getElementById("btnBackFromPlay");

  // ==========================
  // ✅ CONNECT WALLET
  // ==========================
  async function connectWallet() {
    try {
      provider = new ethers.providers.Web3Provider(window.ethereum, "any");

      const currentChain = await ethereum.request({ method: "eth_chainId" });
      if (currentChain !== SOMNIA_CHAIN.chainId) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [SOMNIA_CHAIN]
        });
      }

      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      userAddress = await signer.getAddress();

      contract = new ethers.Contract(
        CONTRACTS.LEADERBOARD,
        ABI.LEADERBOARD,
        signer
      );

      btnConnect.innerText = "CONNECTED";
      btnConnect.disabled = true;

      const saved = localStorage.getItem(`displayName_${userAddress}`);
      if (saved) displayNameInput.value = saved;

      alert("Wallet Connected:\n" + userAddress);

    } catch (err) {
      console.error(err);
      alert("GAGAL CONNECT WALLET");
    }
  }

  // ==========================
  // ✅ SAVE DISPLAY NAME
  // ==========================
  btnSaveName.onclick = () => {
    if (!userAddress) {
      alert("Connect wallet dulu!");
      return;
    }

    const name = displayNameInput.value.trim();
    if (!name || name.length > 12) {
      alert("Nama 1-12 karakter!");
      return;
    }

    localStorage.setItem(`displayName_${userAddress}`, name);
    alert("Display Name tersimpan ✅");
  };

  // ==========================
  // ✅ PLAY GAME → TX ONCHAIN
  // ==========================
  btnPlay.onclick = async () => {
    if (!contract || !userAddress) {
      alert("Connect wallet dulu sebelum Play!");
      return;
    }

    const name = displayNameInput.value.trim();
    if (!name) {
      alert("Isi Display Name dulu!");
      return;
    }

    try {
      btnPlay.disabled = true;
      btnPlay.innerText = "PROCESSING TX...";

      const tx = await contract.startGame({
        value: ethers.utils.parseEther("0.01"),
        gasLimit: 300000
      });

      alert("TX SENT ✅\n" + tx.hash);
      await tx.wait();

      openPlayScreen();

      // kirim sinyal ke pacman bahwa play sudah aktif
      gameFrame.contentWindow.postMessage({
        type: "START_ONCHAIN_OK",
        wallet: userAddress
      }, "*");

    } catch (err) {
      console.error("TX ERROR:", err);
      alert("TRANSAKSI GAGAL / DIBATALKAN");

    } finally {
      btnPlay.disabled = false;
      btnPlay.innerText = "PLAY (0.01 SOMI)";
    }
  };

  // ==========================
  // ✅ RECEIVE SCORE FROM GAME → SUBMIT ONCHAIN
  // ==========================
  window.addEventListener("message", async (e) => {
    if (!e.data || e.data.type !== "SUBMIT_SCORE") return;

    const score = Number(e.data.score || 0);
    if (score <= 0) return;

    try {
      const tx = await contract.submitScore(score, {
        gasLimit: 300000
      });

      alert("Score dikirim ke blockchain ✅");
      await tx.wait();

    } catch (err) {
      console.error("SUBMIT SCORE ERROR:", err);
    }
  });

  // ==========================
  // ✅ OPEN PLAY SCREEN
  // ==========================
  function openPlayScreen() {
    menuScreen.style.display = "none";
    leaderboardScreen.style.display = "none";
    playScreen.style.display = "flex";

    gameFrame.src = "pacman.html";
  }

  // ==========================
  // ✅ BACK TO MENU
  // ==========================
  btnBackFromPlay.onclick = () => {
    gameFrame.src = "about:blank";
    playScreen.style.display = "none";
    menuScreen.style.display = "flex";
  };

  // ==========================
  btnConnect.onclick = connectWallet;

})();
