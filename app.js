// app.js — parent page logic + iframe messaging

// when iframe asks to start game -> call DreamWeb3.startGame()
window.addEventListener("message", async (ev) => {
  const data = ev.data || {};
  if (!data.type) return;

  // iframe requests start game
  if (data.type === "REQUEST_START_GAME") {
    const iframe = document.getElementById("pacman-iframe");
    if (!window.DreamWeb3) {
      iframe && iframe.contentWindow.postMessage({ type: "START_GAME_RESULT", success:false, error:"Web3 not ready" }, "*");
      return;
    }
    const res = await window.DreamWeb3.startGame();
    if (res && res.success) {
      iframe && iframe.contentWindow.postMessage({ type: "START_GAME_RESULT", success:true, tx:res.txhash }, "*");
    } else {
      iframe && iframe.contentWindow.postMessage({ type: "START_GAME_RESULT", success:false, error: res && res.error ? res.error : "unknown" }, "*");
    }
  }

  // iframe requests submit score
  if (data.type === "REQUEST_SUBMIT_SCORE") {
    const score = Number(data.score || 0);
    const iframe = document.getElementById("pacman-iframe");
    if (!window.DreamWeb3) {
      iframe && iframe.contentWindow.postMessage({ type:"SUBMIT_RESULT", success:false, message:"Web3 not ready" },"*");
      return;
    }
    const res = await window.DreamWeb3.submitScore(score);
    iframe && iframe.contentWindow.postMessage({ type:"SUBMIT_RESULT", success: !!res.success, tx: res.txhash || null, message: res.message || null },"*");
    // also update leaderboard iframe if open
    const lb = document.getElementById("leaderboard-iframe");
    if (lb && lb.contentWindow) lb.contentWindow.postMessage({ type:'REFRESH_TOP10' },"*");
  }

  // request parent to get top10
  if (data.type === "REQUEST_TOP10") {
    const iframe = document.getElementById("leaderboard-iframe");
    if (!window.DreamWeb3) {
      iframe && iframe.contentWindow.postMessage({ type:'TOP10_RESULT', success:false, message:"Web3 not ready" },"*");
      return;
    }
    const res = await window.DreamWeb3.getTop10();
    iframe && iframe.contentWindow.postMessage({ type:'TOP10_RESULT', success: !!res.success, players: res.players || [], scores: res.scores || [], message: res.message || null },"*");
  }
});
