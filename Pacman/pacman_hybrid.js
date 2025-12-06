// Misal fungsi game start
function startGame() {
  // Panggil proses pembayaran sebelum game benar-benar dimulai
  processPayment(0.01)
    .then(success => {
      if(success){
        initGame(); // fungsi lama yang memulai game
      } else {
        alert("Payment failed! Please try again.");
      }
    })
    .catch(err => {
      console.error(err);
      alert("Payment error! Check your wallet.");
    });
}

// Fungsi dummy processPayment (ganti sesuai integrasi wallet)
function processPayment(amount){
  return new Promise((resolve, reject) => {
    // Contoh logika wallet / metamask / web3
    console.log(`Processing payment ${amount}...`);
    setTimeout(()=> resolve(true), 1000); // simulasi sukses
  });
}

// Panggil startGame() saat frame ready
window.onload = () => {
  startGame();
};
