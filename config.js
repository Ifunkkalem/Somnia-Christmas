// config.js — production mainnet
window.SOMNIA_RPC = "https://api.infra.mainnet.somnia.network";
window.SOMNIA_CHAIN = {
  chainId: "0x13a7", // 5031 mainnet
  chainName: "Somnia Mainnet",
  nativeCurrency: { name: "Somnia Token", symbol: "SOMI", decimals: 18 },
  rpcUrls: [window.SOMNIA_RPC],
  blockExplorerUrls: ["https://explorer.somnia.network"] // jika ada
};

// Leaderboard contract (you deployed)
window.CONTRACTS = {
  LEADERBOARD: "0xD76b767102f2610b0C97FEE84873c1fAA4c7C365"
};

// minimal ABI for PacmanLeaderboard
window.ABI = {
  LEADERBOARD: [
    "function startGame() payable",
    "function submitScore(uint256 score)",
    "function getTop10() view returns (address[] memory topPlayers, uint256[] memory scores)",
    "function startFeeWei() view returns (uint256)",
    "event GameStarted(address indexed player, uint256 fee)",
    "event ScoreSubmitted(address indexed player, uint256 score)"
  ]
};
