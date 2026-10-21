
function reconstructPath(camerFrom, current) {
    const path = [current];
    while (current in cameFrom) {
        current = cameFrom[current];
        path.unshift(current);
    }

    return path;
}

// From the wikipedia pseudocode
function aStar(tree, startId, goalId) {
    const openSet = new Set([startId])
    const cameFrom = {};
    const gScore = {};
    const fScore = {};

    for (const id in tree) {
        // the g score is the known shortest length
        gScore[id] = Infinity;
        // the f score is the g score + the heuristic (as the crow flies)
        fScore[id] = Infinity;
    }

    gScore[startId] = 0;
    fScore[startId] = heuristic(tree[startId, tree[goalId]])

    while (openSet.size > 0) {
        let current = null;
        for (const id of openSet) {
            if (current === null || fScore[id] < fScore[current]) {
                current = id;
            }
        }
        if (current == goalId) {
            return reconstructPath(cameFrom, current);
        }
        openSet.delete(current);
        for (const neighbourId in tree[current].neighbours) {
            const cost = tree[current].neighbours[neighbourId];
            const tentativeG = gScore[current] + cost;
            if (tentativeG < gScore[neighbourId]) {
                cameFrom[neighbourId] = current;
                gScore[neighbourId] = tentativeG;
                fScore[neighbourId] = tentativeG + heuristic(tree[neighbourId], tree[goalId]);
                openSet.add(neighbourId)
            }
        }
    }
    return null;
}

function heuristic(a, b) {
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y
    return sqrt(pow(dx, 2) + pow(dy, 2))
}

function loadHex(text) {
    const hexes = text.trim().split("\n");
    let finalTree = {};    
    const directions = [
        { q:  1, r: -1, s:  0 },
        { q:  1, r:  0, s: -1 },
        { q:  0, r:  1, s: -1 },
        { q: -1, r:  1, s:  0 },
        { q: -1, r:  0, s:  1 },
        { q:  0, r: -1, s:  1 }
    ];
    hexes.forEach((line, index) => {
        const [q, r, s, tile_name, tile_size] = line.split(",");
        finalTree[index] = {
            coordinate: {
                q: Number(q),
                r: Number(r),
                s: Number(s)
            },
            neighbours: {},
            position: cubeToPixel(
                Number(q),
                Number(r),
                Number(s)
            ),
            entities: new Set()
        };
    });
     for (const id in finalTree) {
        const hex = finalTree[id];

        directions.forEach(direction => {
            const neighbourQ = hex.coordinate.q + direction.q;
            const neighbourR = hex.coordinate.r + direction.r;
            const neighbourS = hex.coordinate.s + direction.s;

            for (const neighbourId in finalTree) {
                const neighbour = finalTree[neighbourId];

                if (neighbour.coordinate.q === neighbourQ &&
                    neighbour.coordinate.r === neighbourR &&
                    neighbour.coordinate.s === neighbourS) {
                    hex.neighbours[neighbourId] = 1;
                    break;
                }
            }
        });
    }

    return finalTree
}

function cubeToPixel(q, r, s, size) {
    return {
        x: size * sqrt(3) * (q + s / 2),
        y: size * 3 / 2 * s
    };
}

function loadGrid(text) {

}

function generateGrid(gridWidth, gridHeight, tileSize) {
    let finalTree = {}
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const id = y * gridHeight + x;
            finalTree[id] = {
                coordinate: {
                    x: x, 
                    y: y
                },
                neighbours: {},
                position: {
                    x: x * tileSize,
                    y: y * tileSize
                },
                entities: {
                }
            };
            if (x > 0) {
                finalTree[id].neighbours[id - 1] = tileSize;
            }
            if (x < gridWidth - 1) {
                finalTree[id].neighbours[id + 1] = tileSize;
            }
            if (y > 0) {
                finalTree[id].neighbours[id - gridHeight] = tileSize;
            }
            if (y < gridHeight - 1) {
                finalTree[id].neighbours[id + gridHeight] = tileSize;
            }
        }
    }
    return finalTree
}
