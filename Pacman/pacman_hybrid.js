/* pacman_hybrid.js — game + parent messaging */
let score = 0;
let running = false;
const width = 20;

// small map (8x20)
const layout = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,
  1,0,1,1,1,1,1,0,0,1,1,0,0,1,1,1,1,1,0,1,
  1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,
  1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0,1,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,1,1,0,1,1,1,1,1,0,0,1,1,1,1,1,0,1,1,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1
];

const grid = document.getElementById("grid-container");
const scoreEl = document.getElementById("score");
let squares = [];
let pacIndex = 21;
let ghostIndex = 58;
let ghostInterval = null;

function createGrid(){
  grid.innerHTML = "";
  squares = [];
  for (let i=0;i<layout.length;i++){
    const d = document.createElement("div");
    d.classList.add("cell");
    if (layout[i]===1) d.classList.add("wall");
    if (layout[i]===0) d.classList.add("dot");
    grid.appendChild(d);
    squares.push(d);
  }
  squares[pacIndex].classList.add("pac");
  squares[ghostIndex].classList.add("ghost");
  score = 0; scoreEl.innerText = "0";
}

function movePac(dir){
  if (!running) return;
  squares[pacIndex].classList.remove("pac");
  let next = pacIndex;
  if (dir==='left') next--;
  if (dir==='right') next++;
  if (dir==='up') next-=width;
  if (dir==='down') next+=width;
  if (squares[next] && !squares[next].classList.contains("wall")) pacIndex = next;
  squares[pacIndex].classList.add("pac");
  collectDot();
  checkCollision();
  checkWin();
}

function collectDot(){
  if (squares[pacIndex].classList.contains("dot")){
    squares[pacIndex].classList.remove("dot");
    score++;
    scoreEl.innerText = score;
  }
}

function ghostMove(){
  if (!running) return;
  const dirs = [-1,1,-width,width];
  let best = ghostIndex; let bestDist = Infinity;
  dirs.forEach(d=>{
    const t = ghostIndex + d;
    if (!squares[t] || squares[t].classList.contains("wall")) return;
    const dist = Math.abs((t%width)-(pacIndex%width)) + Math.abs(Math.floor(t/width)-Math.floor(pacIndex/width));
    if (dist < bestDist){ bestDist = dist; best = t; }
  });
  squares[ghostIndex].classList.remove("ghost");
  ghostIndex = best;
  squares[ghostIndex].classList.add("ghost");
  checkCollision();
}

function checkCollision(){
  if (pacIndex === ghostIndex){
    endGame(false);
  }
}

function checkWin(){
  // if no more dots -> win
  const anyDots = squares.some(s => s.classList.contains("dot"));
  if (!anyDots) endGame(true);
}

function endGame(won){
  running = false;
  clearInterval(ghostInterval);
  // send score to parent to submit onchain
  window.parent.postMessage({ type: "REQUEST_SUBMIT_SCORE", score: score }, "*");
  alert("Game over — score: "+score + (won ? " (you cleared all dots!)":""));
  // reset grid to initial state
  setTimeout(()=>{ createGrid(); }, 400);
}

document.getElementById("btn-up").onclick = ()=> movePac("up");
document.getElementById("btn-down").onclick = ()=> movePac("down");
document.getElementById("btn-left").onclick = ()=> movePac("left");
document.getElementById("btn-right").onclick = ()=> movePac("right");

// START: ask parent to run onchain startGame (fee)
document.getElementById("start-button").onclick = ()=>{
  // request parent -> will call contract.startGame()
  window.parent.postMessage({ type: "REQUEST_START_GAME" }, "*");
};

// handle responses from parent
window.addEventListener("message", (ev)=>{
  const d = ev.data || {};
  if (!d.type) return;
  if (d.type === "START_GAME_RESULT"){
    if (d.success){
      running = true;
      ghostInterval = setInterval(ghostMove, 600);
      alert("Start game success — transaksi: " + (d.tx || d.txhash || ""));
    } else {
      alert("Start game gagal: " + (d.error || d.message || "user cancelled"));
    }
  }
  if (d.type === "SUBMIT_RESULT"){
    if (d.success) alert("Score submitted onchain — tx: " + (d.tx || d.txhash || ""));
    else alert("Submit score failed: " + (d.message || "unknown"));
  }
  if (d.type === "WALLET_CONNECTED"){
    // optional: show display name
    const name = d.displayName || localStorage.getItem("displayName") || "";
    if (name) document.getElementById("score").innerText = "Player: " + name;
  }
});

// init
window.onload = ()=> createGrid();
