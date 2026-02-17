const dicePresets = [4, 6, 8, 10, 12, 20, 100];

const suits = ["Spades", "Hearts", "Diamonds", "Clubs"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const majorArcana = [
  "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor", "The Hierophant",
  "The Lovers", "The Chariot", "Strength", "The Hermit", "Wheel of Fortune", "Justice", "The Hanged Man",
  "Death", "Temperance", "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement", "The World"
];

const tarotSuits = ["Wands", "Cups", "Swords", "Pentacles"];
const minorRanks = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"];
const cardImageBase = "resources/cards";
const tarotImageBase = "resources/tarot";
const cardBackImageUrl = `${cardImageBase}/back.png`;
const tarotBackImageUrl = `${tarotImageBase}/back.jpg`;

const ui = {
  diceStage: document.getElementById("dice-stage"),
  diceBoxHost: document.getElementById("dice-box-host"),
  diceCanvas: document.getElementById("dice-canvas"),
  dicePresets: document.getElementById("dice-presets"),
  diceNotation: document.getElementById("dice-notation"),
  rollNotation: document.getElementById("roll-notation"),
  diceRolls: document.getElementById("dice-rolls"),
  diceResult: document.getElementById("dice-result"),
  cardCountDec: document.getElementById("card-count-dec"),
  cardCountInc: document.getElementById("card-count-inc"),
  cardCountValue: document.getElementById("card-count-value"),
  drawCard: document.getElementById("draw-card"),
  resetCardDeck: document.getElementById("reset-card-deck"),
  cardReturnToggle: document.getElementById("card-return-toggle"),
  cardDraws: document.getElementById("card-draws"),
  cardResult: document.getElementById("card-result"),
  cardMeter: document.getElementById("card-meter"),
  tarotCountDec: document.getElementById("tarot-count-dec"),
  tarotCountInc: document.getElementById("tarot-count-inc"),
  tarotCountValue: document.getElementById("tarot-count-value"),
  drawTarot: document.getElementById("draw-tarot"),
  resetTarotDeck: document.getElementById("reset-tarot-deck"),
  allowReversed: document.getElementById("allow-reversed"),
  tarotReturnToggle: document.getElementById("tarot-return-toggle"),
  tarotDraws: document.getElementById("tarot-draws"),
  tarotResult: document.getElementById("tarot-result"),
  tarotMeter: document.getElementById("tarot-meter")
};

const diceCanvasState = {
  ctx: null,
  width: 0,
  height: 0,
  faces: [],
  animStart: 0,
  animDuration: 520
};

const dice3DState = {
  ready: false,
  loading: false,
  box: null
};

let cardDeck = [];
let tarotDeck = [];
let cardDrawCount = 1;
let tarotDrawCount = 1;

init();

function init() {
  buildDicePresets();
  setupDiceCanvas();
  initDiceBox3D();
  resetCardDeck();
  resetTarotDeck();

  ui.rollNotation.addEventListener("click", () => rollDice(ui.diceNotation.value.trim()));
  ui.diceNotation.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      rollDice(ui.diceNotation.value.trim());
    }
  });

  ui.drawCard.addEventListener("click", drawPlayingCard);
  ui.resetCardDeck.addEventListener("click", resetCardDeck);
  ui.cardCountDec.addEventListener("click", () => updateCardDrawCount(-1));
  ui.cardCountInc.addEventListener("click", () => updateCardDrawCount(1));

  ui.drawTarot.addEventListener("click", drawTarotCard);
  ui.resetTarotDeck.addEventListener("click", resetTarotDeck);
  ui.tarotCountDec.addEventListener("click", () => updateTarotDrawCount(-1));
  ui.tarotCountInc.addEventListener("click", () => updateTarotDrawCount(1));

  rollDice(ui.diceNotation.value.trim());
  renderCardBackPlaceholders();
  renderTarotBackPlaceholders();
}

function setupDiceCanvas() {
  const ctx = ui.diceCanvas.getContext("2d");
  if (!ctx) {
    ui.diceResult.textContent = "Dice display unavailable in this browser.";
    return;
  }

  diceCanvasState.ctx = ctx;
  resizeDiceCanvas();
  window.addEventListener("resize", resizeDiceCanvas);
}

function resizeDiceCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = ui.diceCanvas.clientWidth;
  const cssHeight = ui.diceCanvas.clientHeight;

  ui.diceCanvas.width = Math.floor(cssWidth * dpr);
  ui.diceCanvas.height = Math.floor(cssHeight * dpr);

  diceCanvasState.width = cssWidth;
  diceCanvasState.height = cssHeight;

  diceCanvasState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawDiceCanvas(1);
}

function buildDicePresets() {
  dicePresets.forEach((size) => {
    const btn = document.createElement("button");
    btn.className = "preset";
    btn.textContent = `d${size}`;
    btn.addEventListener("click", () => {
      const notation = `1d${size}`;
      ui.diceNotation.value = notation;
      rollDice(notation);
    });
    ui.dicePresets.appendChild(btn);
  });
}

function rollDice(notation) {
  const parsed = parseDiceExpression(notation);
  if (!parsed) {
    showError(ui.diceResult, "Invalid format. Example: 2d6+d8+3");
    return;
  }

  if (parsed.error) {
    showError(ui.diceResult, parsed.error);
    return;
  }

  const rollDetails = [];
  const termTexts = [];
  let diceTotal = 0;
  let modifierTotal = 0;

  parsed.terms.forEach((term, index) => {
    const signText = term.sign === -1 ? (index === 0 ? "-" : " - ") : index === 0 ? "" : " + ";

    if (term.kind === "const") {
      modifierTotal += term.sign * term.value;
      termTexts.push(`${signText}${term.value}`);
      return;
    }

    const values = [];
    for (let i = 0; i < term.count; i += 1) {
      const value = randInt(1, term.sides);
      values.push(value);
      rollDetails.push({
        sides: term.sides,
        value,
        sign: term.sign
      });
      diceTotal += term.sign * value;
    }

    termTexts.push(`${signText}${term.count}d${term.sides}:[${values.join(",")}]`);
  });

  if (rollDetails.length === 0) {
    showError(ui.diceResult, "Add at least one dice term like d20 or 2d6.");
    return;
  }

  const total = diceTotal + modifierTotal;

  ui.diceResult.classList.remove("bad");
  ui.diceResult.textContent = `${parsed.normalized} -> ${termTexts.join("")} = ${total}`;

  renderDiceRolls(rollDetails);
  const diceBoxPlan = planDiceBoxRoll(parsed);
  console.log("Dice roll plan:", { ready: dice3DState.ready, hasPlan: !!diceBoxPlan, plan: diceBoxPlan });

  if (dice3DState.ready && diceBoxPlan) {
    console.log("Using 3D dice rendering");
    ui.diceStage.classList.add("use-3d");
    rollDiceBox3D(diceBoxPlan);
  } else {
    console.log("Using 2D canvas fallback", { ready: dice3DState.ready, plan: diceBoxPlan });
    ui.diceStage.classList.remove("use-3d");
    renderDiceScene(rollDetails);
  }
}

async function initDiceBox3D() {
  if (dice3DState.loading || !ui.diceBoxHost) return;

  console.log("Starting DiceRoller3D initialization...");
  dice3DState.loading = true;
  try {
    // DiceRoller3D is loaded via script tag in index.html
    window.DiceRoller3D.init("dice-box-host");

    dice3DState.box = window.DiceRoller3D;
    dice3DState.ready = true;
    console.log("Lightweight 3D dice ready!");

    // Re-roll current notation to visibly switch to 3D as soon as ready.
    rollDice(ui.diceNotation.value.trim());
  } catch (error) {
    console.error("3D Dice initialization failed:", error);
    dice3DState.ready = false;
  } finally {
    dice3DState.loading = false;
  }
}

async function rollDiceBox3D(plan) {
  if (!dice3DState.box) return;

  console.log("Rolling 3D dice with lightweight renderer:", plan);
  try {
    // We can just use the normalized notation or reconstruct it
    // For now, DiceRoller3D.roll handles simple notations like "2d6"
    // plan.first is usually something like "1d20"
    dice3DState.box.roll(plan.first);
  } catch (error) {
    console.error("3D dice roll failed:", error);
    ui.diceStage.classList.remove("use-3d");
  }
}

function planDiceBoxRoll(parsed) {
  const diceTerms = parsed.terms.filter((term) => term.kind === "dice");
  if (diceTerms.length < 1) {
    return null;
  }

  // Dice-Box can't represent negative dice terms in a single visual plan.
  if (diceTerms.some((term) => term.sign < 0)) {
    return null;
  }

  const modifier = parsed.terms
    .filter((term) => term.kind === "const")
    .reduce((sum, term) => sum + term.sign * term.value, 0);

  const first = diceTerms[0];
  const firstNotationBase = `${first.count}d${first.sides}`;
  const firstNotation = modifier === 0
    ? firstNotationBase
    : `${firstNotationBase}${modifier > 0 ? `+${modifier}` : modifier}`;

  const additions = diceTerms.slice(1).map((term) => `${term.count}d${term.sides}`);
  return {
    first: firstNotation,
    additions
  };
}

async function rollDiceBox3D(plan) {
  if (!dice3DState.box) {
    console.warn("rollDiceBox3D called but box not initialized");
    return;
  }

  console.log("Rolling 3D dice with plan:", plan);
  try {
    dice3DState.box.clear();
    console.log("Rolling notation:", plan.first);
    await dice3DState.box.roll(plan.first);
    for (const add of plan.additions) {
      console.log("Adding dice:", add);
      await dice3DState.box.add(add);
    }
    console.log("3D dice roll commands sent successfully");
  } catch (error) {
    console.error("3D dice roll failed:", error);
    ui.diceStage.classList.remove("use-3d");
  }
}

function parseDiceExpression(notation) {
  const cleaned = notation.replace(/\s+/g, "").toLowerCase();
  if (!cleaned) {
    return null;
  }

  const normalized = /^[+-]/.test(cleaned) ? cleaned : `+${cleaned}`;
  const tokens = normalized.match(/[+-][^+-]+/g);
  if (!tokens || tokens.join("") !== normalized) {
    return null;
  }

  const terms = [];
  let diceCount = 0;

  for (const token of tokens) {
    const sign = token[0] === "-" ? -1 : 1;
    const body = token.slice(1);

    const diceMatch = body.match(/^(\d*)d(\d+)$/);
    if (diceMatch) {
      const count = Number(diceMatch[1] || 1);
      const sides = Number(diceMatch[2]);
      if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
        return { error: "Use 1-100 dice and 2-1000 sides." };
      }
      diceCount += count;
      if (diceCount > 200) {
        return { error: "Limit total dice to 200 per roll." };
      }
      terms.push({ kind: "dice", sign, count, sides });
      continue;
    }

    const constMatch = body.match(/^\d+$/);
    if (constMatch) {
      terms.push({ kind: "const", sign, value: Number(body) });
      continue;
    }

    return null;
  }

  return { terms, normalized: cleaned };
}

function renderDiceRolls(rolls) {
  ui.diceRolls.innerHTML = "";
  rolls.slice(0, 24).forEach((roll, index) => {
    const chip = document.createElement("span");
    chip.className = "die-chip";
    const prefix = roll.sign < 0 ? "-" : "";
    chip.textContent = `#${index + 1} d${roll.sides}: ${prefix}${roll.value}`;
    ui.diceRolls.appendChild(chip);
  });

  if (rolls.length > 24) {
    const more = document.createElement("span");
    more.className = "die-chip";
    more.textContent = `+${rolls.length - 24} more`;
    ui.diceRolls.appendChild(more);
  }
}

function renderDiceScene(rolls) {
  const visibleRolls = rolls.slice(0, 18);
  const w = diceCanvasState.width;
  const h = diceCanvasState.height;
  if (!w || !h) {
    return;
  }

  const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(visibleRolls.length))));
  const rows = Math.max(1, Math.ceil(visibleRolls.length / cols));
  const cellW = w / cols;
  const cellH = h / rows;
  const size = Math.max(34, Math.min(62, Math.min(cellW, cellH) * 0.54));

  diceCanvasState.faces = visibleRolls.map((roll, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = col * cellW + cellW / 2;
    const cy = row * cellH + cellH / 2;

    return {
      value: roll.sign < 0 ? `-${roll.value}` : String(roll.value),
      sides: roll.sides,
      x: cx,
      y: cy,
      size,
      rotFrom: (Math.random() - 0.5) * 2.8,
      rotTo: (Math.random() - 0.5) * 0.4,
      drop: 28 + Math.random() * 26
    };
  });

  diceCanvasState.animStart = performance.now();
  requestAnimationFrame(animateDiceCanvas);
}

function animateDiceCanvas(now) {
  const elapsed = now - diceCanvasState.animStart;
  const t = Math.min(elapsed / diceCanvasState.animDuration, 1);
  drawDiceCanvas(t);

  if (t < 1) {
    requestAnimationFrame(animateDiceCanvas);
  }
}

function drawDiceCanvas(t) {
  const ctx = diceCanvasState.ctx;
  if (!ctx) {
    return;
  }

  const w = diceCanvasState.width;
  const h = diceCanvasState.height;
  ctx.clearRect(0, 0, w, h);

  diceCanvasState.faces.forEach((face) => {
    const eased = 1 - Math.pow(1 - t, 3);
    const y = face.y - face.drop * (1 - eased);
    const rot = face.rotFrom + (face.rotTo - face.rotFrom) * eased;

    ctx.save();
    ctx.translate(face.x, y);
    ctx.rotate(rot);

    const grad = ctx.createLinearGradient(-face.size / 2, -face.size / 2, face.size / 2, face.size / 2);
    grad.addColorStop(0, "#ffe8a7");
    grad.addColorStop(1, "#ffbf4d");

    const dieType = getDieType(face.sides);
    drawDieShapePath(ctx, dieType, face.size);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.stroke();
    drawDieFacetLines(ctx, dieType, face.size);

    ctx.fillStyle = "#121212";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.max(14, Math.floor(face.size * 0.34))}px "Avenir Next", "Century Gothic", sans-serif`;
    ctx.fillText(String(face.value), 0, 0);

    ctx.restore();
  });
}

function getDieType(sides) {
  if (sides <= 4) return "d4";
  if (sides <= 6) return "d6";
  if (sides <= 8) return "d8";
  if (sides <= 10) return "d10";
  if (sides <= 12) return "d12";
  if (sides <= 20) return "d20";
  return "d100";
}

function drawDieShapePath(ctx, dieType, size) {
  const half = size / 2;

  if (dieType === "d4") {
    polygonPath(ctx, 3, half * 0.96, -Math.PI / 2);
    return;
  }

  if (dieType === "d6") {
    roundRect(ctx, -half, -half, size, size, size * 0.14);
    return;
  }

  if (dieType === "d8") {
    polygonPath(ctx, 4, half * 0.98, Math.PI / 4);
    return;
  }

  if (dieType === "d10" || dieType === "d100") {
    // d10-style pentagonal trapezoid silhouette
    ctx.beginPath();
    ctx.moveTo(0, -half * 0.98);
    ctx.lineTo(half * 0.72, -half * 0.28);
    ctx.lineTo(half * 0.5, half * 0.76);
    ctx.lineTo(-half * 0.5, half * 0.76);
    ctx.lineTo(-half * 0.72, -half * 0.28);
    ctx.closePath();
    return;
  }

  if (dieType === "d12") {
    // d12 is commonly represented as a pentagon silhouette
    polygonPath(ctx, 5, half * 0.98, -Math.PI / 2);
    return;
  }

  // d20 represented as an icosahedron-like triangle silhouette
  polygonPath(ctx, 3, half * 1.02, -Math.PI / 2);
}

function drawDieFacetLines(ctx, dieType, size) {
  const half = size / 2;
  ctx.strokeStyle = "rgba(0,0,0,0.20)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  if (dieType === "d4") {
    ctx.moveTo(-half * 0.62, half * 0.3);
    ctx.lineTo(half * 0.62, half * 0.3);
    ctx.moveTo(0, -half * 0.94);
    ctx.lineTo(0, half * 0.3);
  } else if (dieType === "d6") {
    ctx.moveTo(-half * 0.75, 0);
    ctx.lineTo(half * 0.75, 0);
    ctx.moveTo(0, -half * 0.75);
    ctx.lineTo(0, half * 0.75);
  } else if (dieType === "d8") {
    ctx.moveTo(-half * 0.68, 0);
    ctx.lineTo(half * 0.68, 0);
    ctx.moveTo(0, -half * 0.68);
    ctx.lineTo(0, half * 0.68);
  } else if (dieType === "d10" || dieType === "d100") {
    ctx.moveTo(0, -half * 0.9);
    ctx.lineTo(0, half * 0.7);
    ctx.moveTo(-half * 0.5, half * 0.1);
    ctx.lineTo(half * 0.5, half * 0.1);
  } else if (dieType === "d12") {
    polygonPath(ctx, 5, half * 0.53, -Math.PI / 2);
  } else if (dieType === "d20") {
    ctx.moveTo(-half * 0.56, half * 0.33);
    ctx.lineTo(half * 0.56, half * 0.33);
    ctx.moveTo(0, -half * 0.92);
    ctx.lineTo(0, half * 0.33);
  }

  ctx.stroke();
}

function polygonPath(ctx, points, radius, rotation) {
  ctx.beginPath();
  for (let i = 0; i < points; i += 1) {
    const a = rotation + (Math.PI * 2 * i) / points;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function resetCardDeck() {
  cardDeck = shuffle(makePlayingDeck());
  updateCardMeter();
  ui.cardResult.classList.remove("bad");
  ui.cardResult.textContent = `Deck is fresh: ${cardDeck.length} cards remaining.`;
  renderCardBackPlaceholders();
}

function drawPlayingCard() {
  if (cardDeck.length === 0) {
    showError(ui.cardResult, "No cards left. Reset the deck.");
    return;
  }

  const returnToDeck = ui.cardReturnToggle && ui.cardReturnToggle.checked;
  const drawCount = Math.min(cardDrawCount, cardDeck.length);
  const drawn = [];
  for (let i = 0; i < drawCount; i += 1) {
    drawn.push(cardDeck.pop());
  }

  if (returnToDeck) {
    cardDeck.push(...drawn);
    cardDeck = shuffle(cardDeck);
  }

  renderDrawGrid(ui.cardDraws, drawn.map((card) => ({
    src: card.imageUrl,
    alt: `${card.rank} of ${card.suit}`,
    reversed: false,
    fallback: cardBackImageUrl
  })));

  const names = drawn.map((card) => `${card.rank} of ${card.suit}`).join(", ");
  const suffix = drawCount < cardDrawCount ? ` (only ${drawCount} available)` : "";
  const returnText = returnToDeck ? " Returned to deck." : "";
  ui.cardResult.classList.remove("bad");
  ui.cardResult.textContent = `Drew ${drawCount}: ${names}.${suffix}${returnText} ${cardDeck.length} left.`;
  updateCardMeter();
}

function resetTarotDeck() {
  tarotDeck = shuffle(makeTarotDeck());
  updateTarotMeter();
  ui.tarotResult.classList.remove("bad");
  ui.tarotResult.textContent = `Tarot deck is ready: ${tarotDeck.length} cards.`;
  renderTarotBackPlaceholders();
}

function drawTarotCard() {
  if (tarotDeck.length === 0) {
    showError(ui.tarotResult, "No tarot cards left. Reset the deck.");
    return;
  }

  const allowReversed = ui.allowReversed ? ui.allowReversed.checked : true;
  const returnToDeck = ui.tarotReturnToggle && ui.tarotReturnToggle.checked;
  const drawCount = Math.min(tarotDrawCount, tarotDeck.length);
  const drawn = [];
  for (let i = 0; i < drawCount; i += 1) {
    const card = tarotDeck.pop();
    const isReversed = allowReversed && Math.random() < 0.5;
    drawn.push({
      name: card.name,
      src: card.imageUrl,
      reversed: isReversed
    });
  }

  if (returnToDeck) {
    tarotDeck.push(...drawn.map((card) => ({
      name: card.name,
      imageUrl: card.src
    })));
    tarotDeck = shuffle(tarotDeck);
  }

  renderDrawGrid(ui.tarotDraws, drawn.map((card) => ({
    src: card.src,
    alt: `${card.name} tarot card`,
    reversed: card.reversed,
    fallback: makeTarotFallbackFace(card.name)
  })));

  const names = drawn.map((card) => `${card.name}${card.reversed ? " (Reversed)" : ""}`).join(", ");
  const suffix = drawCount < tarotDrawCount ? ` (only ${drawCount} available)` : "";
  const returnText = returnToDeck ? " Returned to deck." : "";

  ui.tarotResult.classList.remove("bad");
  ui.tarotResult.textContent = `Tarot ${drawCount}: ${names}.${suffix}${returnText} ${tarotDeck.length} left.`;
  updateTarotMeter();
}

function makePlayingDeck() {
  const deck = [];
  suits.forEach((suit) => {
    ranks.forEach((rank) => {
      deck.push({
        suit,
        rank,
        imageUrl: `${cardImageBase}/${toCardCode(rank, suit)}.png`
      });
    });
  });
  return deck;
}

function toCardCode(rank, suit) {
  const rankCode = rank === "10" ? "0" : rank;
  const suitCode = {
    Spades: "S",
    Hearts: "H",
    Diamonds: "D",
    Clubs: "C"
  }[suit];
  return `${rankCode}${suitCode}`;
}

function makeTarotDeck() {
  const deck = [];

  majorArcana.forEach((card, index) => {
    const majorCode = String(index).padStart(2, "0");
    const fileName = `major-${majorCode}.jpg`;
    deck.push({
      name: card,
      imageUrl: tarotImageFor(fileName)
    });
  });

  tarotSuits.forEach((suit) => {
    minorRanks.forEach((rank, index) => {
      const name = `${rank} of ${suit}`;
      const minorCode = String(index + 1).padStart(2, "0");
      const fileName = `${suit.toLowerCase()}-${minorCode}.jpg`;
      deck.push({
        name,
        imageUrl: tarotImageFor(fileName)
      });
    });
  });

  return deck;
}

function updateCardMeter() {
  const ratio = (cardDeck.length / 52) * 100;
  ui.cardMeter.style.width = `${ratio}%`;
}

function updateTarotMeter() {
  const ratio = (tarotDeck.length / 78) * 100;
  ui.tarotMeter.style.width = `${ratio}%`;
}

function shuffle(items) {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function showError(node, message) {
  node.classList.add("bad");
  node.textContent = message;
}

function updateCardDrawCount(delta) {
  cardDrawCount = clamp(cardDrawCount + delta, 1, 6);
  ui.cardCountValue.textContent = String(cardDrawCount);
  renderCardBackPlaceholders();
}

function updateTarotDrawCount(delta) {
  tarotDrawCount = clamp(tarotDrawCount + delta, 1, 6);
  ui.tarotCountValue.textContent = String(tarotDrawCount);
  renderTarotBackPlaceholders();
}

function renderCardBackPlaceholders() {
  const cards = Array.from({ length: cardDrawCount }, () => ({
    src: cardBackImageUrl,
    alt: "Playing card back",
    reversed: false,
    fallback: cardBackImageUrl
  }));
  renderDrawGrid(ui.cardDraws, cards);
}

function renderTarotBackPlaceholders() {
  const cards = Array.from({ length: tarotDrawCount }, () => ({
    src: tarotBackImageUrl,
    alt: "Tarot card back",
    reversed: false,
    fallback: tarotBackImageUrl
  }));
  renderDrawGrid(ui.tarotDraws, cards);
}

function renderDrawGrid(container, cards) {
  container.innerHTML = "";
  const countClass = `count-${Math.min(cards.length, 6)}`;
  container.className = `draw-grid ${countClass}`;

  cards.forEach((card) => {
    const img = document.createElement("img");
    img.src = card.src;
    img.alt = card.alt;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.src = card.fallback || tarotBackImageUrl;
      img.classList.remove("reversed");
    }, { once: true });
    if (card.reversed) {
      img.classList.add("reversed");
    }
    container.appendChild(img);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tarotImageFor(fileName) {
  return `${tarotImageBase}/${fileName}`;
}

function makeTarotFallbackFace(name) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 420'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#efe2c1'/>
      <stop offset='1' stop-color='#d6c39a'/>
    </linearGradient>
  </defs>
  <rect x='0' y='0' width='240' height='420' rx='16' fill='url(#g)'/>
  <rect x='10' y='10' width='220' height='400' rx='12' fill='none' stroke='#4f4532' stroke-width='1.1'/>
  <rect x='24' y='76' width='192' height='250' rx='8' fill='#b9aa89' opacity='0.42'/>
  <text x='120' y='44' text-anchor='middle' fill='#2f2b22' font-size='16' font-family='Georgia,serif' font-weight='700'>${escapeXml(name)}</text>
  <text x='120' y='204' text-anchor='middle' fill='#403729' font-size='18' font-family='Georgia,serif'>Image Unavailable</text>
  <text x='120' y='386' text-anchor='middle' fill='#5a4f3a' font-size='13' font-family='Georgia,serif'>Local placeholder</text>
</svg>`)}`;
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
