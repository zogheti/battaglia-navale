/* Battaglia Navale - logica del gioco ottimizzata */
"use strict";

const SIZE = 10;
const LETTERS = "ABCDEFGHIJ".split("");

const FLEET_TEMPLATE = [
    { length: 1, label: "Elicottero", count: 2, image: "assets/ships/1elicottero.gif" },
    { length: 2, label: "Motovedetta", count: 2, image: "assets/ships/2motovedetta.gif" },
    { length: 3, label: "Sottomarino", count: 1, image: "assets/ships/3sottomarino.gif" },
    { length: 3, label: "Incrociatore", count: 1, image: "assets/ships/3incrociatore.gif" },
    { length: 4, label: "Corazzata", count: 1, image: "assets/ships/4incrociatore.gif" },
    { length: 5, label: "Portaerei", count: 1, image: "assets/ships/5portaerei.gif" }
];

const SHIP_IMAGES = {
    1: "assets/ships/1elicottero.gif",
    2: "assets/ships/2motovedetta.gif",
    3: "assets/ships/3sottomarino.gif",
    4: "assets/ships/4incrociatore.gif",
    5: "assets/ships/5portaerei.gif"
};

const SOUND_FILES = {
    shot: "assets/sounds/shot.mp3",
    water: "assets/sounds/water.mp3",
    hit: "assets/sounds/hit.mp3",
    sinking: "assets/sounds/sinking.mp3",
    victory: "assets/sounds/victory.mp3",
    defeat: "assets/sounds/defeat.mp3",
    click: "assets/sounds/click.mp3",
    inizio: "assets/sounds/inizio.mp3" // <-- Nuovo suono per l'inizio partita
};

const $ = id => document.getElementById(id);

const ui = {
    statusTitle: $("status-title"),
    statusMessage: $("status-message"),
    statusLight: $("status-light"),
    playerShipsLeft: $("player-ships-left"),
    enemyShipsLeft: $("enemy-ships-left"),
    setupPanel: $("setup-panel"),
    battlePanel: $("battle-panel"),
    fleetList: $("fleet-list"),
    setupBoard: $("setup-board"),
    playerBoard: $("player-board"),
    enemyBoard: $("enemy-board"),
    placedCount: $("placed-count"),
    rotate: $("rotate-ship"),
    autoPlace: $("auto-place"),
    start: $("start-game"),
    newGame: $("new-game"),
    soundToggle: $("sound-toggle"),
    difficulty: $("difficulty"),
    shots: $("shots-count"),
    hits: $("hits-count"),
    accuracy: $("accuracy-count"),
    turn: $("turn-count"),
    playerChip: $("player-board-chip"),
    enemyChip: $("enemy-board-chip"),
    rulesToggle: $("rules-toggle"),
    rulesDialog: $("rules-dialog"),
    resultDialog: $("result-dialog"),
    resultTitle: $("result-title"),
    resultMessage: $("result-message"),
    playAgain: $("play-again")
};

// Stato del gioco raggruppato
const game = {
    playerShips: [],
    enemyShips: [],
    playerShots: new Set(),
    enemyShots: new Set(),
    selectedShipId: null,
    orientation: "H",
    phase: "setup",
    busy: false,
    soundEnabled: true,
    playerShotCount: 0,
    playerHitCount: 0,
    aiHitsInProgress: [],
    aiTargetQueue: [],
    previewCells: []
};

function makeFleet() {
    const fleet = [];
    let id = 1;

    FLEET_TEMPLATE.forEach(type => {
        for (let i = 0; i < type.count; i++) {
            fleet.push({
                id: `ship-${id++}`,
                length: type.length,
                label: type.label,
                image: type.image,
                cells: [],
                hits: new Set(),
                sunk: false
            });
        }
    });

    // Ordina subito la flotta dalla più grande alla più piccola
    return fleet.sort((a, b) => b.length - a.length);
}

const key = (r, c) => `${r},${c}`;
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const cellLabel = (r, c) => `${LETTERS[c]}${r + 1}`;

function shipAt(ships, r, c) {
    return ships.find(ship => ship.cells.some(([sr, sc]) => sr === r && sc === c));
}

function setStatus(title, message, color = "gold") {
    ui.statusTitle.textContent = title;
    ui.statusMessage.textContent = message;

    const colors = {
        red: { bg: "#ff645f", shadow: "rgba(255,100,95,.6)" },
        cyan: { bg: "#56d7e9", shadow: "rgba(86,215,233,.6)" },
        gold: { bg: "#e8bd68", shadow: "rgba(232,189,104,.6)" }
    };

    const current = colors[color] || colors.gold;
    ui.statusLight.style.background = current.bg;
    ui.statusLight.style.boxShadow = `0 0 12px ${current.shadow}`;
}

function playSound(name) {
    if (!game.soundEnabled) return;
    const audio = new Audio(SOUND_FILES[name]);
    audio.volume = 0.45;
    audio.play().catch(() => { });
}

function shipImage(ship, className = "ship-image") {
    const img = document.createElement("img");
    img.className = className;
    img.alt = "";
    img.draggable = false;
    img.src = ship.image || SHIP_IMAGES[ship.length];
    img.onerror = () => img.remove();
    return img;
}

function getPlacementCells(r, c, length, dir) {
    const cells = [];
    for (let i = 0; i < length; i++) {
        cells.push([
            r + (dir === "V" ? i : 0),
            c + (dir === "H" ? i : 0)
        ]);
    }
    return cells;
}

function isPlacementValid(cells, ships, ignoredShipId = null) {
    const occupied = new Set();

    ships
        .filter(s => s.id !== ignoredShipId)
        .forEach(s => s.cells.forEach(([r, c]) => occupied.add(key(r, c))));

    for (const [r, c] of cells) {
        if (!inBounds(r, c) || occupied.has(key(r, c))) return false;

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (inBounds(r + dr, c + dc) && occupied.has(key(r + dr, c + dc))) {
                    return false;
                }
            }
        }
    }
    return true;
}

function placeShip(ship, r, c, dir, ships) {
    const cells = getPlacementCells(r, c, ship.length, dir);
    if (!isPlacementValid(cells, ships, ship.id)) return false;

    ship.cells = cells;
    ship.hits.clear();
    ship.sunk = false;
    return true;
}

function randomPlacement(ships) {
    const ordered = [...ships].sort((a, b) => b.length - a.length);

    ordered.forEach(ship => {
        ship.cells = [];
        ship.hits.clear();
        ship.sunk = false;
    });

    for (const ship of ordered) {
        let placed = false;
        for (let tries = 0; tries < 5000 && !placed; tries++) {
            const dir = Math.random() < 0.5 ? "H" : "V";
            const r = Math.floor(Math.random() * SIZE);
            const c = Math.floor(Math.random() * SIZE);
            placed = placeShip(ship, r, c, dir, ships);
        }
        if (!placed) return false;
    }
    return true;
}

function createBoard(container, boardType) {
    container.innerHTML = "";
    const board = document.createElement("div");
    board.className = "board";
    board.setAttribute("role", "grid");
    board.setAttribute("aria-label", boardType === "setup" ? "Tabellone posizionamento" : "Tabellone battaglia");

    const corner = document.createElement("div");
    corner.className = "axis";
    board.appendChild(corner);

    LETTERS.forEach(letter => {
        const axis = document.createElement("div");
        axis.className = "axis";
        axis.textContent = letter;
        board.appendChild(axis);
    });

    for (let r = 0; r < SIZE; r++) {
        const axis = document.createElement("div");
        axis.className = "axis";
        axis.textContent = r + 1;
        board.appendChild(axis);

        for (let c = 0; c < SIZE; c++) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.setAttribute("role", "gridcell");
            cell.setAttribute("aria-label", cellLabel(r, c));

            if (boardType === "setup") {
                cell.addEventListener("mouseenter", () => showPreview(r, c));
                cell.addEventListener("focus", () => showPreview(r, c));
                cell.addEventListener("mouseleave", clearPreview);
                cell.addEventListener("blur", clearPreview);
                cell.addEventListener("click", () => handleSetupCell(r, c));
            } else if (boardType === "enemy") {
                cell.addEventListener("click", () => handlePlayerShot(r, c));
            }

            board.appendChild(cell);
        }
    }
    container.appendChild(board);
}

const getBoardCell = (container, r, c) => container.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);

function renderFleetList() {
    ui.fleetList.innerHTML = "";

    game.playerShips.forEach(ship => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "fleet-item" +
            (ship.id === game.selectedShipId ? " selected" : "") +
            (ship.cells.length ? " placed" : "");
        button.disabled = game.phase !== "setup";

        const icon = document.createElement("span");
        icon.className = "fleet-icon";
        for (let i = 0; i < ship.length; i++) {
            icon.appendChild(document.createElement("i"));
        }

        const text = document.createElement("span");
        text.className = "fleet-text";

        const title = document.createElement("strong");
        // Mostra solo il nome della nave (es. "Portaerei", "Corazzata", ecc.)
        title.textContent = ship.label;

        const sub = document.createElement("small");
        sub.textContent = ship.cells.length ? `Posizionata: ${cellLabel(...ship.cells[0])}` : "Da posizionare";

        text.append(title, sub);

        const state = document.createElement("span");
        state.className = "fleet-state";
        state.textContent = ship.cells.length ? "OK" : "Scegli";

        button.append(icon, text, state);

        button.addEventListener("click", () => {
            game.selectedShipId = ship.id;
            setStatus("Nave selezionata", `Posiziona ${ship.label} (${ship.length} caselle).`);
            renderSetupBoard();
        });

        ui.fleetList.appendChild(button);
    });
}

function addShipOverlay(board, ship) {
    if (!ship.cells.length) return;

    const [startR, startC] = ship.cells[0];
    const [endR, endC] = ship.cells[ship.cells.length - 1];

    const firstCell = getBoardCell(board, startR, startC);
    const lastCell = getBoardCell(board, endR, endC);
    if (!firstCell || !lastCell) return;

    board.style.position = "relative";
    const boardRect = board.getBoundingClientRect();
    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();

    const left = firstRect.left - boardRect.left - board.clientLeft;
    const top = firstRect.top - boardRect.top - board.clientTop;
    const right = lastRect.right - boardRect.left - board.clientLeft;
    const bottom = lastRect.bottom - boardRect.top - board.clientTop;

    const areaWidth = right - left;
    const areaHeight = bottom - top;
    const vertical = startC === endC && ship.length > 1;

    const img = shipImage(ship, "ship-overlay");
    img.style.position = "absolute";
    img.style.zIndex = "5";
    img.style.pointerEvents = "none";
    img.style.objectFit = "fill";

    if (vertical) {
        img.style.width = `${areaHeight}px`;
        img.style.height = `${areaWidth}px`;
        img.style.left = `${left + (areaWidth - areaHeight) / 2}px`;
        img.style.top = `${top + (areaHeight - areaWidth) / 2}px`;
        img.style.transform = "rotate(90deg)";
        img.style.transformOrigin = "center center";
    } else {
        img.style.left = `${left}px`;
        img.style.top = `${top}px`;
        img.style.width = `${areaWidth}px`;
        img.style.height = `${areaHeight}px`;
        img.style.transform = "none";
    }

    board.appendChild(img);
}

function addFireOverlay(cell) {
    if (cell.querySelector(".fire-overlay")) return;

    const fireImg = document.createElement("img");
    fireImg.src = "assets/ships/fuoco.gif";
    fireImg.className = "fire-overlay";
    fireImg.alt = "Colpito";
    fireImg.draggable = false;

    fireImg.style.position = "absolute";
    fireImg.style.inset = "0";
    fireImg.style.width = "100%";
    fireImg.style.height = "100%";
    fireImg.style.objectFit = "contain";
    fireImg.style.objectPosition = "center";
    fireImg.style.zIndex = "10";
    fireImg.style.pointerEvents = "none";

    cell.appendChild(fireImg);
}

function renderSetupBoard() {
    createBoard(ui.setupBoard, "setup");
    const board = ui.setupBoard.querySelector(".board");

    board.querySelectorAll(".cell").forEach(cell => {
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        const ship = shipAt(game.playerShips, r, c);
        if (ship) {
            cell.classList.add("ship");
            cell.title = `${ship.label} — clicca per rimuovere`;
        }
    });

    game.playerShips.forEach(ship => {
        if (ship.cells.length) addShipOverlay(board, ship);
    });

    const placedCount = game.playerShips.filter(s => s.cells.length).length;
    ui.placedCount.textContent = `${placedCount} / ${game.playerShips.length} posizionate`;
    ui.start.disabled = game.playerShips.some(s => !s.cells.length);

    renderFleetList();
}

function clearPreview() {
    game.previewCells.forEach(({ r, c }) => {
        const cell = getBoardCell(ui.setupBoard, r, c);
        if (cell) cell.classList.remove("preview", "invalid");
    });
    game.previewCells = [];
}

function showPreview(r, c) {
    if (game.phase !== "setup") return;
    clearPreview();

    const ship = game.playerShips.find(s => s.id === game.selectedShipId);
    if (!ship || ship.cells.length) return;

    const cells = getPlacementCells(r, c, ship.length, game.orientation);
    const valid = isPlacementValid(cells, game.playerShips, ship.id);

    cells.forEach(([rr, cc]) => {
        if (!inBounds(rr, cc)) return;
        const cell = getBoardCell(ui.setupBoard, rr, cc);
        if (cell) {
            cell.classList.add("preview");
            if (!valid) cell.classList.add("invalid");
        }
        game.previewCells.push({ r: rr, c: cc });
    });
}

function handleSetupCell(r, c) {
    if (game.phase !== "setup") return;

    const existing = shipAt(game.playerShips, r, c);
    if (existing) {
        existing.cells = [];
        existing.hits.clear();
        existing.sunk = false;
        game.selectedShipId = existing.id;
        playSound("click");
        setStatus("Nave rimossa", `${existing.label} è tornata nella lista.`, "cyan");
        renderSetupBoard();
        return;
    }

    const ship = game.playerShips.find(s => s.id === game.selectedShipId);
    if (!ship) {
        setStatus("Seleziona una nave", "Scegli prima una nave dalla lista.");
        return;
    }

    if (!placeShip(ship, r, c, game.orientation, game.playerShips)) {
        playSound("click");
        setStatus("Posizione non valida", "La nave esce dalla griglia o tocca un'altra.", "red");
        return;
    }

    playSound("click");
    game.selectedShipId = game.playerShips.find(s => !s.cells.length)?.id || null;
    setStatus("Nave posizionata", `${ship.label} collocata in ${cellLabel(r, c)}.`, "cyan");
    renderSetupBoard();

    if (!game.selectedShipId) {
        setStatus("Flotta pronta", "Tutte le navi sono posizionate. Puoi iniziare.", "cyan");
    }
}

function autoPlacePlayer() {
    if (game.phase !== "setup") return;
    playSound("click");
    if (!randomPlacement(game.playerShips)) {
        setStatus("Errore di posizionamento", "Impossibile posizionare la flotta. Riprova.", "red");
        return;
    }
    game.selectedShipId = null;
    renderSetupBoard();
    setStatus("Flotta schierata", "Posizionamento automatico completato. Premi Inizia.", "cyan");
}

function updateShipCounts() {
    ui.playerShipsLeft.textContent = game.playerShips.filter(s => !s.sunk).length;
    ui.enemyShipsLeft.textContent = game.enemyShips.filter(s => !s.sunk).length;
}

function renderBattleBoard(container, ships, shots, revealShips, boardType) {
    createBoard(container, boardType);
    const board = container.querySelector(".board");

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const cell = getBoardCell(container, r, c);
            const k = key(r, c);
            const ship = shipAt(ships, r, c);

            if (revealShips && ship) cell.classList.add("ship");

            if (shots.has(k)) {
                if (ship) {
                    cell.classList.remove("ship");
                    cell.classList.add(ship.sunk ? "sunk" : "hit");

                    cell.setAttribute(
                        "aria-label",
                        `${cellLabel(r, c)}: colpito`
                    );

                    addFireOverlay(cell);
                } else {
                    cell.classList.add("miss");

                    cell.setAttribute(
                        "aria-label",
                        `${cellLabel(r, c)}: acqua`
                    );
                }
            }

            if (boardType === "enemy") {
                cell.disabled =
                    game.phase !== "battle" || game.busy || shots.has(k);

                if (!shots.has(k)) {
                    cell.title = `Spara a ${cellLabel(r, c)}`;
                }
            } else {
                cell.disabled = true;
            }
        }
    }

    ships.forEach(ship => {
        if (ship.cells.length && (revealShips || ship.sunk)) {
            addShipOverlay(board, ship);
        }
    });
}

function renderBattle() {
    renderBattleBoard(ui.playerBoard, game.playerShips, game.enemyShots, true, "player");
    renderBattleBoard(ui.enemyBoard, game.enemyShips, game.playerShots, false, "enemy");

    updateShipCounts();

    ui.shots.textContent = game.playerShotCount;
    ui.hits.textContent = game.playerHitCount;
    ui.accuracy.textContent = `${game.playerShotCount ? Math.round((game.playerHitCount / game.playerShotCount) * 100) : 0}%`;
    ui.turn.textContent = game.busy ? "Computer" : (game.phase === "battle" ? "Giocatore" : "—");
}

function startGame() {
    if (game.playerShips.some(s => !s.cells.length)) return;

    game.enemyShips = makeFleet();
    if (!randomPlacement(game.enemyShips)) {
        setStatus("Errore", "Impossibile preparare la flotta nemica. Riprova.", "red");
        return;
    }

    game.phase = "battle";
    game.busy = false;
    game.playerShots.clear();
    game.enemyShots.clear();
    game.playerShotCount = 0;
    game.playerHitCount = 0;
    game.aiHitsInProgress = [];
    game.aiTargetQueue = [];

    ui.setupPanel.classList.add("hidden");
    ui.battlePanel.classList.remove("hidden");
    ui.playerChip.textContent = "In difesa";
    ui.enemyChip.textContent = "Bersagli nascosti";

    renderBattle();
    setStatus("Battaglia iniziata", "Seleziona una casella nemica per sparare.", "cyan");
    playSound("inizio");
}

function handlePlayerShot(r, c) {
    if (game.phase !== "battle" || game.busy || game.playerShots.has(key(r, c))) return;

    const k = key(r, c);
    game.playerShots.add(k);
    game.playerShotCount++;
    playSound("shot");

    const ship = shipAt(game.enemyShips, r, c);
    if (ship) {
        ship.hits.add(k);
        game.playerHitCount++;
        playSound("hit");

        const targetCell = getBoardCell(ui.enemyBoard, r, c);
        if (targetCell) addFireOverlay(targetCell);

        if (ship.hits.size === ship.length) {
            ship.sunk = true;
            playSound("sinking");
            setStatus("Nave nemica affondata!", `Hai affondato ${ship.label}. Tiri ancora!`, "cyan");
        } else {
            setStatus("Colpo a segno!", `Impatto confermato in ${cellLabel(r, c)}. Tiri ancora!`, "cyan");
        }

        renderBattle();

        if (game.enemyShips.every(s => s.sunk)) {
            finishGame(true);
            return;
        }

        // Se ha colpito una nave, il turno NON passa al computer: il giocatore può sparare di nuovo
        game.busy = false;
        return;
    } else {
        playSound("water");
        setStatus("Acqua!", `Il colpo in ${cellLabel(r, c)} è in acqua. Turno del computer.`, "gold");

        // Se prende acqua, il computer prende il controllo ed entra in azione
        game.busy = true;
        renderBattle();

        window.setTimeout(computerTurn, 750);
    }
}

function finishGame(playerWon) {
    game.phase = "finished";
    game.busy = false;
    renderBattle();

    ui.resultTitle.textContent = playerWon ? "Vittoria!" : "Sconfitta";
    ui.resultMessage.textContent = playerWon
        ? `Hai affondato la flotta nemica in ${game.playerShotCount} colpi (precisione: ${Math.round((game.playerHitCount / game.playerShotCount) * 100)}%).`
        : "La tua flotta è stata distrutta. Riprova!";

    playSound(playerWon ? "victory" : "defeat");
    setStatus(playerWon ? "Missione compiuta" : "Missione fallita", playerWon ? "Nemico eliminato." : "Flotta persa.", playerWon ? "cyan" : "red");
    ui.resultDialog.showModal();
}

/* ==========================================
   LOGICA INTELLIGENZA ARTIFICIALE (IA)
   ================================---------- */

function getAvailableTargets() {
    const available = [];
    const diff = ui.difficulty.value;

    // Raccogliamo tutte le celle da evitare attorno alle navi affondate
    const forbiddenNearSunk = new Set();

    if (diff !== "easy") {
        game.playerShips.forEach(ship => {
            if (ship.sunk) {
                // Decidiamo se applicare la regola: 75% per normale, 100% per difficile
                const applyRule = diff === "hard" || Math.random() < 0.75;
                if (applyRule) {
                    ship.cells.forEach(([sr, sc]) => {
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                const rr = sr + dr;
                                const cc = sc + dc;
                                if (inBounds(rr, cc)) {
                                    forbiddenNearSunk.add(key(rr, cc));
                                }
                            }
                        }
                    });
                }
            }
        });
    }

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const k = key(r, c);
            // La cella è disponibile se non è già stata colpita E (se attivo) non si trova attorno a una nave affondata
            if (!game.enemyShots.has(k) && !forbiddenNearSunk.has(k)) {
                available.push([r, c]);
            }
        }
    }

    // Fallback di sicurezza: se per caso la griglia finisce le celle valide, prende quelle libere rimaste
    if (available.length === 0 && diff !== "easy") {
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                if (!game.enemyShots.has(key(r, c))) available.push([r, c]);
            }
        }
    }

    return available;
}
/* Funzione di supporto per pulire o gestire la coda di bersagli in corso */
/* Funzione di supporto per la caccia dopo aver colpito una nave */
function getTargetFromHitsInProgress() {
    const availableKeys = new Set(getAvailableTargets().map(([r, c]) => key(r, c)));

    // Se abbiamo almeno 2 colpi a segno sulla stessa nave, la direzione è CHIARA (Orizzontale o Verticale)
    if (game.aiHitsInProgress.length > 1) {
        // Svuotiamo la coda generica delle direzioni cardinali: non serve più sparare sui lati!
        game.aiTargetQueue = [];

        const rows = game.aiHitsInProgress.map(p => p[0]);
        const cols = game.aiHitsInProgress.map(p => p[1]);

        const horizontal = rows.every(r => r === rows[0]);
        const vertical = cols.every(c => c === cols[0]);

        const candidates = [];

        if (horizontal) {
            // La nave è orizzontale: spara solo agli estremi sinistro e destro
            const row = rows[0];
            const minC = Math.min(...cols);
            const maxC = Math.max(...cols);
            candidates.push([row, minC - 1], [row, maxC + 1]);
        } else if (vertical) {
            // La nave è verticale: spara solo agli estremi superiore e inferiore
            const col = cols[0];
            const minR = Math.min(...rows);
            const maxR = Math.max(...rows);
            candidates.push([minR - 1, col], [maxR + 1, col]);
        }

        // Prende la prima estremità valida ancora libera
        for (const [r, c] of candidates) {
            if (inBounds(r, c) && availableKeys.has(key(r, c))) {
                return [r, c];
            }
        }
    }

    // Se c'è solo 1 colpo a segno, usiamo la coda cardinale (su, giù, sinistra, destra)
    while (game.aiTargetQueue.length) {
        const target = game.aiTargetQueue.shift();
        if (availableKeys.has(key(target[0], target[1]))) {
            return target;
        }
    }

    // Se è il primissimo colpo della caccia, genera le 4 posizioni cardinali attigue
    if (game.aiHitsInProgress.length === 1) {
        const [r, c] = game.aiHitsInProgress[0];
        const candidates = [
            [r - 1, c], // Alto
            [r + 1, c], // Basso
            [r, c - 1], // Sinistra
            [r, c + 1]  // Destra
        ];

        candidates.forEach(([cr, cc]) => {
            if (inBounds(cr, cc) && availableKeys.has(key(cr, cc))) {
                game.aiTargetQueue.push([cr, cc]);
            }
        });

        if (game.aiTargetQueue.length) {
            return game.aiTargetQueue.shift();
        }
    }

    return null;
}
/* --- MODALITÀ FACILE --- */
function getEasyTarget() {
    // 1. Se ha colpito una nave, segue le direzioni cardinali
    const huntTarget = getTargetFromHitsInProgress();
    if (huntTarget) return huntTarget;

    // 2. Altrimenti spara completamente a caso
    const available = getAvailableTargets();
    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)];
}

/* --- MODALITÀ NORMALE --- */
function getNormalTarget() {
    // 1. Se ha colpito una nave, segue la logica di caccia cardinale/direzionale
    const huntTarget = getTargetFromHitsInProgress();
    if (huntTarget) return huntTarget;

    // 2. Altrimenti cerca a scacchiera
    const available = getAvailableTargets();
    if (!available.length) return null;

    const checkerboard = available.filter(([r, c]) => (r + c) % 2 === 0);
    const pool = checkerboard.length ? checkerboard : available;
    return pool[Math.floor(Math.random() * pool.length)];
}

/* --- MODALITÀ DIFFICILE (Heatmap / Acqua libera + Regola celle attorno alle navi affondate) --- */
function getHardTarget() {
    // 1. Se ha colpito una nave, segue la stessa logica di caccia intelligente
    const huntTarget = getTargetFromHitsInProgress();
    if (huntTarget) return huntTarget;

    const available = getAvailableTargets();
    if (!available.length) return null;

    // Crea una mappa di "acqua libera" (conta quanti spazi liberi/inesplorati ci sono attorno ad ogni cella)
    const boardScores = Array(SIZE).fill(0).map(() => Array(SIZE).fill(0));

    available.forEach(([r, c]) => {
        let openSpaces = 0;
        // Esamina le 4 direzioni cardinali per calcolare lo spazio aperto di acqua libera
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        directions.forEach(([dr, dc]) => {
            let rr = r + dr;
            let cc = c + dc;
            // Conta quante celle consecutive libere ci sono in quella direzione
            while (inBounds(rr, cc) && !game.enemyShots.has(key(rr, cc))) {
                openSpaces++;
                rr += dr;
                cc += dc;
            }
        });

        boardScores[r][c] = openSpaces;
    });

    // Trova la cella con il punteggio più alto di acqua libera
    let maxScore = -1;
    let bestTargets = [];

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const k = key(r, c);
            if (!game.enemyShots.has(k)) {
                const score = boardScores[r][c];
                if (score > maxScore) {
                    maxScore = score;
                    bestTargets = [[r, c]];
                } else if (score === maxScore) {
                    bestTargets.push([r, c]);
                }
            }
        }
    }

    if (bestTargets.length > 0) {
        return bestTargets[Math.floor(Math.random() * bestTargets.length)];
    }

    return available[Math.floor(Math.random() * available.length)];
}

/* Funzione centrale smistamento IA */
function getAiTarget() {
    const diff = ui.difficulty.value;

    if (diff === "hard") {
        return getHardTarget();
    } else if (diff === "normal") {
        return getNormalTarget();
    } else {
        return getEasyTarget();
    }
}
function computerTurn() {
    if (game.phase !== "battle") return;

    const target = getAiTarget();
    if (!target) {
        game.busy = false;
        return;
    }

    const [r, c] = target;
    const k = key(r, c);
    game.enemyShots.add(k);
    playSound("shot");

    const ship = shipAt(game.playerShips, r, c);
    if (ship) {
        ship.hits.add(k);
        playSound("hit");
        game.aiHitsInProgress.push([r, c]);

        const targetCell = getBoardCell(ui.playerBoard, r, c);
        if (targetCell) addFireOverlay(targetCell);

        if (ship.hits.size === ship.length) {
            ship.sunk = true;
            playSound("sinking");
            game.aiHitsInProgress = [];
            game.aiTargetQueue = [];
            setStatus("Nave affondata!", `Il computer ha distrutto la tua nave in ${cellLabel(r, c)}.`, "red");
        }

        renderBattle();

        if (game.playerShips.every(s => s.sunk)) {
            finishGame(false);
            return;
        }

        window.setTimeout(computerTurn, 750);
    } else {
        playSound("water");
        setStatus("Il computer ha mancato", `Il colpo nemico in ${cellLabel(r, c)} è in acqua. Tocca a te!`, "cyan");

        game.busy = false;
        renderBattle();
        ui.turn.textContent = "Giocatore";
        ui.enemyChip.textContent = "Il tuo turno";
    }
}
function resetGame() {
    game.phase = "setup";
    game.busy = false;
    game.orientation = "H";
    game.playerShips = makeFleet();
    game.enemyShips = makeFleet();
    game.playerShots.clear();
    game.enemyShots.clear();
    game.selectedShipId = game.playerShips[0].id;
    game.playerShotCount = 0;
    game.playerHitCount = 0;
    game.aiHitsInProgress = [];
    game.aiTargetQueue = [];
    game.previewCells = [];

    ui.setupPanel.classList.remove("hidden");
    ui.battlePanel.classList.add("hidden");
    ui.rotate.textContent = "↻ Ruota: orizzontale";

    if (ui.resultDialog.open) ui.resultDialog.close();

    renderSetupBoard();
    setStatus("Prepara la tua flotta", "Seleziona una nave e clicca sul tabellone.");
}

// Event Listeners
ui.rotate.addEventListener("click", () => {
    game.orientation = game.orientation === "H" ? "V" : "H";
    ui.rotate.textContent = `↻ Ruota: ${game.orientation === "H" ? "orizzontale" : "verticale"}`;
    playSound("click");
    setStatus("Orientamento modificato", `Prossima nave: ${game.orientation === "H" ? "orizzontale" : "verticale"}.`, "cyan");
});

ui.autoPlace.addEventListener("click", autoPlacePlayer);
ui.start.addEventListener("click", startGame);

ui.newGame.addEventListener("click", () => {
    if (game.phase === "battle" && !confirm("Vuoi abbandonare la partita corrente?")) return;
    resetGame();
});

ui.soundToggle.addEventListener("click", () => {
    game.soundEnabled = !game.soundEnabled;
    ui.soundToggle.textContent = game.soundEnabled ? "♫ Audio ON" : "♫ Audio OFF";
    ui.soundToggle.setAttribute("aria-pressed", String(game.soundEnabled));
    if (game.soundEnabled) playSound("click");
});

ui.rulesToggle.addEventListener("click", () => ui.rulesDialog.showModal());
ui.playAgain.addEventListener("click", resetGame);

// Ascolta la pressione dei tasti sulla tastiera
document.addEventListener("keydown", (e) => {
    // Controlla se la barra spaziatrice è stata premuta e se siamo nella fase di posizionamento (setup)
    if (e.code === "Space" && game.phase === "setup") {
        e.preventDefault(); // Evita lo scroll indesiderato della pagina web

        // Simula il cambio di orientamento
        game.orientation = game.orientation === "H" ? "V" : "H";
        ui.rotate.textContent = `↻ Ruota: ${game.orientation === "H" ? "orizzontale" : "verticale"}`;
        playSound("click");

        setStatus(
            "Orientamento modificato",
            `La prossima nave sarà posizionata in ${game.orientation === "H" ? "orizzontale" : "verticale"}.`,
            "cyan"
        );

        // Se c'è una nave selezionata e il mouse è sopra il tabellone, aggiorna l'anteprima (preview)
        // (L'anteprima si aggiornerà automaticamente al primo movimento o click del mouse)
    }
});

// Avvio
resetGame();