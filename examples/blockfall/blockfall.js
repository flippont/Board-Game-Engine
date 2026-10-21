let textSprite = new SpriteManager(context, "./fonts/capitals.png", 3, 15, 0, 0)
let tileMap = new SpriteManager(context, "./tilemap.png", 1, 8, 0, 0)
let textOrder = `ABCDEFGHIJKLMNOPQRSTUVWXYZ!?()0123456789:_><|`;
context.imageSmoothingEnabled = false;
let currentScore = 0;
const DELAY_CONST = 0.12;
const TETROMINOS = {
    I: {
        offsets: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: -1, y: 0 }
        ],
        colour: "cyan"
    },

    O: {
        offsets: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 }
        ],
        colour: "yellow"
    },

    T: {
        offsets: [
            { x: 0, y: 0 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 }
        ],
        colour: "purple"
    },

    S: {
        offsets: [
            { x: 0, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: -1, y: 0 }
        ],
        colour: "green"
    },

    Z: {
        offsets: [
            { x: 0, y: 0 },
            { x: -1, y: 0 },
            { x: -1, y: 1 },
            { x: 1, y: 0 }
        ],
        colour: "red"
    },

    J: {
        offsets: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: -1, y: 1 }
        ],
        colour: "blue"
    },

    L: {
        offsets: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 1, y: 1 }
        ],
        colour: "orange"
    }
}

function clearLines(tree, scene) {
    const clearedRows = [];
    for (let y = 0; y < 20; y++) {
        let full = true;
        for (let x = 0; x < 10; x++) {
            const node = tree.getNodeAt(x, y);
            if (!node) {full = false; break;}
            let occupied = false;
            for (const entity of node.entities) {
                if (entity instanceof Piece) {
                    occupied = true;
                    break;
                }
            }
            if (!occupied) {full = false; break;}
        }
        if (full) {
            clearedRows.push(y);
            currentScore += 1000;
        }
    }
    if (clearedRows.length === 0) {
        return 0;
    }
    scene.add(new LineClearEffect(tree, clearedRows));
    for (const entity of [...scene.entities]) {
        if (!(entity instanceof Piece)) continue;
        const nodesToDelete = [];
        for (const nodeId of entity.nodes) {
            const node = tree.nodes.get(String(nodeId));
            if (!node) continue;
            if (clearedRows.includes(node.coordinate.y)) {
                nodesToDelete.push(nodeId);
            }
        }
        if (nodesToDelete.length > 0) {
            entity.deleteNodes(nodesToDelete);
        }
    }
    for (const entity of [...scene.entities]) {
        if (!(entity instanceof Piece)) continue;
        if (entity.nodes.size === 0) {
            scene.remove(entity);
            continue;
        }
        const oldBlocks = [];
        for (const nodeId of entity.nodes) {
            const node = tree.nodes.get(String(nodeId));
            if (!node) continue;
            oldBlocks.push({
                nodeId: String(nodeId),
                x: node.coordinate.x,
                y: node.coordinate.y,
                frame: entity.frames.get(String(nodeId)) ?? 0
            });
        }
        for (const block of oldBlocks) {
            const node = tree.nodes.get(block.nodeId);
            if (node) {
                node.entities.delete(entity);
            }
        }
        const newNodes = [];
        const newFrames = new Map();
        for (const block of oldBlocks) {
            let drop = 0;
            for (const row of clearedRows) {
                if (row > block.y) {
                    drop++;
                }
            }
            const newNode = tree.getNodeAt(block.x, block.y + drop);
            if (!newNode) continue;
            const newNodeId = String(newNode.id);
            newNodes.push(newNodeId);
            newFrames.set(newNodeId, block.frame);
            newNode.entities.add(entity);
        }
        entity.nodes = new Set(newNodes);
        entity.frames = newFrames;
        const anchor = tree.nodes.get(String(entity.anchor));
        if (anchor) {
            entity.offsets = [];
            for (const nodeId of entity.nodes) {
                const node = tree.nodes.get(String(nodeId));
                entity.offsets.push({
                    x: node.coordinate.x - anchor.coordinate.x,
                    y: node.coordinate.y - anchor.coordinate.y
                });
            }
        }
    }
    return clearedRows.length;
}

class PieceShadow extends Entity {
    constructor(tree) {
        super();
        this.tree = tree;
        this.colour = [75, 75, 75];
    }

    render() {
        if (!this.scene || !this.tree) return;
        const active = this.scene.tag("activePiece").values().next().value;
        if (!active || !active.nodes.size || !active.spriteManager) {
            return;
        }

        const tree = this.tree;
        const system = tree.system;

        let landingAnchor = tree.nodes.get(
            String(active.anchor)
        );

        if (!landingAnchor || !system) return;

        while (true) {
            const nextCoordinate = system.getNeighbourCoordinate(landingAnchor.coordinate, GRID_DIRECTIONS.down);
            const nextAnchor = tree.getNodeAt(nextCoordinate);

            if (!nextAnchor) break;
            const candidateNodes = active.offsets.map(
                offset => {
                    const coordinate = system.translate(nextAnchor.coordinate, offset);
                    return tree.getNodeAt(coordinate);
                }
            );
            if (candidateNodes.some(node => !node)) {
                break;
            }

            const candidateIds = candidateNodes.map(
                node => String(node.id)
            );

            const collisions = active.checkCollisionLayer(2, candidateIds) || [];
            if (collisions.length > 0) break;
            landingAnchor = nextAnchor;
        }
        const activeNodeIds = [...active.nodes];

        for (let i = 0; i < active.offsets.length; i++) {
            const coordinate = system.translate(landingAnchor.coordinate, active.offsets[i]);
            const node = tree.getNodeAt(coordinate);
            if (!node) continue;
            const position = tree.getWorldPosition(node);
            const frame = active.frames.get(String(activeNodeIds[i])) ?? active.frame ?? 0;
            active.spriteManager.renderSprite(position.x, position.y, frame, this.colour);
        }
    }
}

class LineClearEffect extends Entity {
    constructor(tree, rows) {
        super();
        this.tree = tree;
        this.rows = rows;
        this.elapsed = 0;
        this.duration = 0.16;
    }

    render(context) {
        context.fillStyle = "#ffffff";
        for (const y of this.rows) {
            const first = this.tree.getNodeAt(0, y);
            const nextX = this.tree.getNodeAt(1, y);
            const nextY = this.tree.getNodeAt(0, y + 1) || this.tree.getNodeAt(0, y - 1);
            if (!first) continue;
            const position = this.tree.getWorldPosition(first);
            const horizontal = nextX ? this.tree.getWorldPosition(nextX) : null;
            const vertical = nextY ? this.tree.getWorldPosition(nextY) : null;
            const width = horizontal ? Math.abs(horizontal.x - position.x) * 10 : 80;
            const height = vertical ? Math.abs(vertical.y - position.y) : 8;
            context.fillRect(position.x, position.y, width, height);
        }
    }

    process(dt) {
        this.elapsed += dt;
        if (this.elapsed >= this.duration && this.scene) {
            this.scene.remove(this);
        }
    }
}

function generateTetromino(id, spriteManager, tree, anchorNode, forcedType = null) {
    const types = Object.keys(TETROMINOS)
    const type = forcedType || types[floor(Math.random() * types.length)];
    const data = TETROMINOS[type]

    const piece = new Piece(id, spriteManager, 0, tree)
    piece.anchor = String(anchorNode)
    piece.offsets = data.offsets.map(offset => ({
        x: offset.x,
        y: offset.y
    }))
    piece.collisionLayers = new Set([2])
    piece.onCollisionLayer(2, (other) => {
    })
    piece.type = type;
    piece.tags = ["activePiece", "tetramino"]
    piece.movementSetting = {
        animation: MOVEMENT.easeOut,
        duration: 0.07
    };

    piece.rotationSetting = {
        animation: MOVEMENT.easeInOut,
        duration: 0.095
    };
    piece.frames = new Map()
    piece.generate()
    piece.colour = data.colour
    return piece
}

class TetrominoPreview extends Entity {
    constructor(spriteManager, getType, x, y, width = 40, labelFrames) {
        super();

        this.spriteManager = spriteManager;
        this.getType = getType;
        this.x = x;
        this.y = y;
        this.width = width;
        this.labelFrames = labelFrames;
    }

    render(context) {
        const type = this.getType();

        context.save();

        if (this.spriteManager && this.labelFrames) {
            const glyphWidth = this.spriteManager.spriteWidth;
            const glyphHeight = this.spriteManager.spriteHeight;
            const totalWidth = this.labelFrames.length * glyphWidth;
            const startX = this.x + (this.width - totalWidth) / 2;

            for (let i = 0; i < this.labelFrames.length; i++) {
                this.spriteManager.renderSprite(
                    startX + i * glyphWidth, this.y - glyphHeight,
                    this.labelFrames[i], "white"
                );
            }
        }

        if (!type || !TETROMINOS[type]) {
            context.restore();
            return;
        }

        const data = TETROMINOS[type];
        const offsets = data.offsets;

        const cellWidth = this.spriteManager.spriteWidth || 8;
        const cellHeight = this.spriteManager.spriteHeight || 8;

        const minX = Math.min(...offsets.map(o => o.x));
        const maxX = Math.max(...offsets.map(o => o.x));
        const minY = Math.min(...offsets.map(o => o.y));
        const maxY = Math.max(...offsets.map(o => o.y));

        const pieceWidth = (maxX - minX + 1) * cellWidth;

        const startX = this.x + (this.width - pieceWidth) / 2;
        const startY = this.y + 4;

        for (const offset of offsets) {
            this.spriteManager.renderSprite(
                startX + (offset.x - minX) * cellWidth, startY + (offset.y - minY) * cellHeight, 
                0, data.colour, cellWidth, cellHeight);
        }

        context.restore();
    }
}

let holdType = null;
let canHold = true;

function randomTetrominoType() {
    const types = Object.keys(TETROMINOS);
    return types[floor(random() * types.length)];
}

let nextType = randomTetrominoType();

function takeNextType() {
    const type = nextType;
    nextType = randomTetrominoType();
    return type;
}

function lockPiece(piece, scene, tree, getNextType = null, onSpawn = null) {
    scene.removeTags(piece, "activePiece");
    clearLines(tree, scene);
    const type = getNextType ? getNextType() : null;
    const newPiece = generateTetromino("tetramino", tileMap, tree, "4", type);
    if (checkGameOver(newPiece)) {
        piece.deleteNodes([...piece.nodes]);
        tree.removeEntity(piece);
        gameOver();
        return false;
    }

    if (newPiece) {
        scene.add(newPiece);
        if (onSpawn) {
            onSpawn();
        }
    }
    return true;
}

function checkGameOver(piece) {
    return piece.checkCollisionLayer(2).length > 0;
}

function titleScreen() {
    Scene.changeScene()
    let testText = new TextManager(textSprite, context, textOrder)
    testText.addText("BLOCK FALL", 40, 50, 500, 0, 0, "white")
    testText.addText("PLAY GAME", 50, 150, 500, 0, 0, "white")
    testText.addText("QUIT GAME", 50, 165, 500, 0, 0, "white")
    let testTree = generateGrid(1, 2, 15)
    let titleTree = new Tree(40, 150, testTree, new GridSystem)
    let testPiece = new Piece("0", tileMap, 1, titleTree);
    testPiece.tags = ["selector"]
    testPiece.movementSetting = {
        animation: MOVEMENT.linear,
        duration: 0.1
    }
    testPiece.generate();
    scenes[0].add(testText)
    scenes[0].add(titleTree);
    scenes[0].add(testPiece)
    scenes[0].camera.x = canvas.width / 2
    scenes[0].camera.y = canvas.height / 2
    let currentScene = "game"
    scenes[0].process = (dt) => {
        const piece = scenes[0].tag("selector").values().next().value;
        if (PRESSED[KEYBOARD.DOWN]) {
            piece.move(GRID_DIRECTIONS.down);
            currentScene = "quit"
        }
        if (PRESSED[KEYBOARD.UP]) {
            piece.move(GRID_DIRECTIONS.up);
            currentScene = "game"
        }
        if (PRESSED[KEYBOARD.Z]) {
            if (currentScene == "game") {
                gameScreen();
            } else {
                window.close();
            }
        }
    }
    resize()
}

function gameOver () {
    Scene.changeScene()
    let testText = new TextManager(textSprite, context, textOrder)
    testText.addText("GAME OVER", 40, 50, 500, 0, 0, "white")
    testText.addText("FINAL SCORE:" + currentScore, 20, 70, 500, 0, 0, "white")
    testText.addText("PRESS C TO RETURN TO MAIN MENU", 40, 150, 100, 0, 0, "grey")
    scenes[0].add(testText)
    scenes[0].camera.x = canvas.width / 2
    scenes[0].camera.y = canvas.height / 2
    scenes[0].process = (dt) => {
        if (PRESSED[KEYBOARD.C]) {
            currentScore = 0;
            titleScreen();
        }
    }
    resize()
}


function gameScreen() {
    Scene.changeScene()
    let dropTimer = 0;
    let inputDelay = 0;
    let softDropDelay = 0;

    const SOFT_DROP_DELAY = 0.045;
    scenes[0].process = (dt) => {
        dropTimer += dt;
        inputDelay -= dt;
        softDropDelay -= dt;

        const piece = scenes[0].tag("activePiece").values().next().value;
        if (!piece) return;
        if ((PRESSED[KEYBOARD.C] || PRESSED[KEYBOARD.SHIFT]) && canHold) {
            const oldType = piece.type;
            const replacementType = holdType ?? takeNextType();
            holdType = oldType;
            canHold = false;
            piece.deleteNodes([...piece.nodes]);
            scenes[0].remove(piece);
            const replacement = generateTetromino("tetramino", tileMap, treeTest, "4", replacementType);
            if (checkGameOver(replacement)) {
                replacement.deleteNodes([...replacement.nodes]);
                gameOver();
                return;
            }
            scenes[0].add(replacement);
            dropTimer = 0;
            inputDelay = 0;
            softDropDelay = 0;

            return;
        }
        if (PRESSED[KEYBOARD.SPACE]) {
            piece.moveAnimation = null;
            piece.rotationAnimation = null;

            const oldSetting = piece.movementSetting;
            piece.movementSetting = {
                animation: null,
                duration: 0
            };

            while (piece.move(GRID_DIRECTIONS.down)) {}
            piece.movementSetting = oldSetting;
            lockPiece(piece, scenes[0], treeTest, takeNextType,
                () => {
                    canHold = true;
                }
            );            
            dropTimer = 0;
            inputDelay = 0;
            return;
        }

        if (piece.type !== "O") {
            if (PRESSED[KEYBOARD.X]) {
                piece.rotate(GRID_ROTATIONS.clockwiseRightAngle, true);
            } else if (PRESSED[KEYBOARD.Z] || PRESSED[KEYBOARD.UP]) {
                piece.rotate(GRID_ROTATIONS.anticlockwiseRightAngle, true);
            }
        }

        const left = DOWN[KEYBOARD.LEFT];
        const right = DOWN[KEYBOARD.RIGHT];

        if (left && !right) {
            if (PRESSED[KEYBOARD.LEFT] || inputDelay <= 0) {
                piece.move(GRID_DIRECTIONS.left);
                inputDelay = DELAY_CONST;
            }
        } else if (right && !left) {
            if (PRESSED[KEYBOARD.RIGHT] || inputDelay <= 0) {
                piece.move(GRID_DIRECTIONS.right);
                inputDelay = DELAY_CONST;
            }
        } else {
            inputDelay = 0;
        }

        if (DOWN[KEYBOARD.DOWN] && softDropDelay <= 0) {
            piece.move(GRID_DIRECTIONS.down);
            softDropDelay = SOFT_DROP_DELAY;
            dropTimer = 0;
        }

        if (!DOWN[KEYBOARD.DOWN]) {
            softDropDelay = 0;
        }

        if (dropTimer >= 0.3) {
            dropTimer = 0;
            testText.textData[0].text = String(currentScore);
            if (!piece.move(GRID_DIRECTIONS.down)) {
                lockPiece(piece, scenes[0], treeTest, takeNextType,
                    () => {
                        canHold = true;
                    }
                );            
            }
        }
    };
    let testText = new TextManager(textSprite, context, textOrder)
    testText.addText(String(currentScore), 110, 120, 500, 0, 0, "white")
    let testTree = generateGrid(10, 20, 8)
    const treeTest = new Tree(10, 30, testTree, new GridSystem)
    scenes[0].add(treeTest)
    for (const [nodeId] of treeTest.nodes) {
        scenes[0].add(new Tile(tileMap, 0, treeTest, nodeId, [55, 55, 55]));
    }
    scenes[0].add(new PieceShadow(treeTest));
    scenes[0].add(new TetrominoPreview(tileMap, () => holdType, 100, 45, 36, [2, 3, 4]));
    scenes[0].add(new TetrominoPreview(tileMap, () => nextType, 100, 80, 40, [5, 6, 7]));

    const newPiece = generateTetromino("tetramino", tileMap, treeTest, "4", takeNextType());
    if (newPiece) { scenes[0].add(newPiece) }
    scenes[0].add(testText)
    scenes[0].camera.x = canvas.width / 2
    scenes[0].camera.y = canvas.height / 2
    resize()
}

titleScreen()
