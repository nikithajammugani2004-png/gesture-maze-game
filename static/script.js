const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const videoElement = document.getElementById('input-video');

const offCanvas = document.createElement('canvas');
offCanvas.width = 1000;
offCanvas.height = 750;
const offCtx = offCanvas.getContext('2d');

let fingerTip = null;
let smoothPos = null;
const smoothingFactor = 0.2;

let isDrawing = false; 
let pathPoints = [];
let gameOver = false;
let gameWon = false;
let camera = null;
let audioCtx = null;

let startTime = 0;
let elapsedTime = 0;

let selectedImagePath = "/static/images/moon.png";
let mazeImg = new Image();
let isImageLoaded = false;

function selectLevel(element) {
    document.querySelectorAll('.level-badge').forEach(badge => badge.classList.remove('active'));
    element.classList.add('active');
    loadSelectedMazeImage();
}

function playSound(type) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'win') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    }
}

function generateRandomMaze(rows, cols) {
    const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({
        visited: false,
        walls: { top: true, right: true, bottom: true, left: true }
    })));

    function visit(r, c) {
        grid[r][c].visited = true;
        const neighbors = [
            [r - 1, c, 'top', 'bottom'],
            [r + 1, c, 'bottom', 'top'],
            [r, c - 1, 'left', 'right'],
            [r, c + 1, 'right', 'left']
        ].sort(() => Math.random() - 0.5);

        for (const [nr, nc, dir, opp] of neighbors) {
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited) {
                grid[r][c].walls[dir] = false;
                grid[nr][nc].walls[opp] = false;
                visit(nr, nc);
            }
        }
    }

    visit(0, 0);
    return grid;
}

function loadSelectedMazeImage() {
    isImageLoaded = false;
    offCtx.clearRect(0, 0, 1000, 750);

    const rows = 10;
    const cols = 12;
    const startX = 100;
    const startY = 75;
    const width = 800;
    const height = 600;
    const cellW = width / cols;
    const cellH = height / rows;

    const maze = generateRandomMaze(rows, cols);

    offCtx.strokeStyle = "#000000";
    offCtx.lineWidth = 12;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = startX + c * cellW;
            const y = startY + r * cellH;
            const cell = maze[r][c];

            offCtx.beginPath();
            if (cell.walls.top) { offCtx.moveTo(x, y); offCtx.lineTo(x + cellW, y); }
            if (cell.walls.right) { offCtx.moveTo(x + cellW, y); offCtx.lineTo(x + cellW, y + cellH); }
            if (cell.walls.bottom) { offCtx.moveTo(x, y + cellH); offCtx.lineTo(x + cellW, y + cellH); }
            if (cell.walls.left) { offCtx.moveTo(x, y); offCtx.lineTo(x, y + cellH); }
            offCtx.stroke();
        }
    }

    isImageLoaded = true;
}

function startGame() {
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';

    loadSelectedMazeImage();
    resetGame();

    if (!camera) {
        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        hands.onResults(onResults);

        camera = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({ image: videoElement });
            },
            width: 1000,
            height: 750
        });
        camera.start();
    }
}

function resetGame() {
    gameOver = false;
    gameWon = false;
    pathPoints = [];
    smoothPos = null;
    startTime = Date.now();
    elapsedTime = 0;
    document.getElementById('timer-display').innerText = "⏱️ Time: 0.0s";
    
    // Generate a fresh random layout on reset
    loadSelectedMazeImage();
}

function goHome() {
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('home-screen').style.display = 'block';
}

function checkCollision(pt) {
    if (!pt || !isImageLoaded) return false;
    
    const px = Math.floor(pt.x);
    const py = Math.floor(pt.y);
    
    if (px < 0 || px >= 1000 || py < 0 || py >= 750) return false;
    
    const pixel = offCtx.getImageData(px, py, 1, 1).data;
    return (pixel[0] < 80 && pixel[1] < 80 && pixel[2] < 80 && pixel[3] > 100);
}

function checkWin(pt) {
    if (!pt) return false;
    return (pt.x > 840 && pt.y < 140);
}

function onResults(results) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!gameOver && !gameWon && startTime > 0) {
        elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        document.getElementById('timer-display').innerText = `⏱️ Time: ${elapsedTime}s`;
    }

    // 1. Draw Video
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 2. Draw Glowing Walls Only
    if (isImageLoaded) {
        ctx.save();
        ctx.shadowColor = "#00FFFF";
        ctx.shadowBlur = 15;
        ctx.drawImage(offCanvas, 0, 0);
        ctx.restore();
    }

    // 3. Clear Start & End Zone Markers (Top Corners)
    ctx.save();
    ctx.fillStyle = "#00FF66";
    ctx.shadowColor = "#00FF66";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(130, 110, 18, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px Arial";
    ctx.fillText("START", 112, 114);

    ctx.fillStyle = "#FF0055";
    ctx.shadowColor = "#FF0055";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(870, 110, 18, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px Arial";
    ctx.fillText("END 🏁", 852, 114);
    ctx.restore();

    // 4. Tracking & Smoothing
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const indexTip = landmarks[8];
        const indexPip = landmarks[6];

        const rawX = (1 - indexTip.x) * canvas.width;
        const rawY = indexTip.y * canvas.height;

        if (!smoothPos) {
            smoothPos = { x: rawX, y: rawY };
        } else {
            smoothPos.x += (rawX - smoothPos.x) * smoothingFactor;
            smoothPos.y += (rawY - smoothPos.y) * smoothingFactor;
        }

        fingerTip = { x: smoothPos.x, y: smoothPos.y };

        const indexUp = indexTip.y < indexPip.y;
        const middleTip = landmarks[12];
        const middlePip = landmarks[10];
        const middleUp = middleTip.y < middlePip.y;

        if (indexUp && !middleUp && !gameOver && !gameWon) {
            isDrawing = true;
            pathPoints.push(fingerTip);

            if (checkCollision(fingerTip)) {
                gameOver = true;
                playSound('hit');
            }
            if (checkWin(fingerTip)) {
                gameWon = true;
                playSound('win');
            }
        } else {
            isDrawing = false;
        }

        ctx.fillStyle = isDrawing ? "#00FF00" : "#FFA500";
        ctx.beginPath();
        ctx.arc(fingerTip.x, fingerTip.y, 8, 0, 2 * Math.PI);
        ctx.fill();
    } else {
        smoothPos = null;
    }

    // 5. Draw Neon Player Path
    if (pathPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = "#FF0055";
        ctx.shadowColor = "#FF0055";
        ctx.shadowBlur = 10;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
        for (let i = 1; i < pathPoints.length; i++) {
            ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // 6. Popups
    if (gameOver) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 36px Arial";
        ctx.fillText("WALL HIT!", 320, 280);
        ctx.font = "20px Arial";
        ctx.fillText("Click 'Try Again' above to restart", 260, 330);
    } else if (gameWon) {
        ctx.fillStyle = "rgba(0, 255, 100, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 42px Arial";
        ctx.fillText("GAME COMPLETED!", 210, 260);
        ctx.font = "24px Arial";
        ctx.fillText(`Clean Run! Time: ${elapsedTime}s 🎉`, 270, 310);
    }
}