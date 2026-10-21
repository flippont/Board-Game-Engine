import { HexSystem } from "../utilities/hex_system.js";
import { GridSystem } from "../utilities/grid_system.js";

class Tree extends Entity{
    constructor(x, y, tree, system = null) {
        super()
        this.nodes = new Map();
        this.list = [];
        this.entities = new Set();
        this.coordinates = new Map();
        this.position = {x: x, y: y};

        // Explicit systems are preferred. The fallback keeps the old constructor usable.
        this.system = system || Tree.inferSystem(tree);
        this.calculateNodes(tree);
    }

    static inferSystem(tree) {
        for (const node of Object.values(tree || {})) {
            if (!node?.coordinate) continue;

            if (node.coordinate.x !== undefined && node.coordinate.y !== undefined) {
                return new GridSystem();
            }

            if (
                node.coordinate.q !== undefined &&
                node.coordinate.r !== undefined &&
                node.coordinate.s !== undefined
            ) {
                return new HexSystem();
            }
        }

        throw new Error("Tree requires a CoordinateSystem");
    }

    get type() {
        return this.system?.name || "null";
    }

    getWorldPosition(node) {
        return {
            x: node.position.x + this.position.x,
            y: node.position.y + this.position.y
        };
    }
    addNode(key, node) {
        key = String(key);
        if (this.nodes.has(key)) {
            return;
        }
        node.id = key
        node.entities = new Set();
        this.list.push(node);
        this.nodes.set(key, node);
        this.addCoordinate(node, key);
    }

    addCoordinate(node, key) {
        if (!node.coordinate || !this.system) {
            return;
        }
        this.coordinates.set(
            this.system.getKey(node.coordinate),
            key
        );
    }

    getNodeAt(coordinate, ...args) {
        if (!this.system) return null;
        if (typeof coordinate !== "object" || coordinate === null) {
            coordinate = this.system.fromArgs(coordinate, ...args);
        }
        const key = this.coordinates.get(this.system.getKey(coordinate));
        if (key === undefined) {
            return null;
        }
        return this.nodes.get(String(key)) || null;
    }

    getNodeId(node) {
        return node?.id ?? null;
    }

    addEntity(entity) {
        if (this.entities.has(entity)) {
            return;
        }
        this.entities.add(entity);
    }

    calculateNodes(tree) {
        for (const [key, node] of Object.entries(tree || {})) {
            this.addNode(key, node);
        }
    }
    
    removeEntity(entity) {
        this.entities.delete(entity);
    }

    drawEdge(context, node, neighbour) {
        context.beginPath();
        context.moveTo(node.position.x, node.position.y);
        context.lineTo(neighbour.position.x, neighbour.position.y);
        context.strokeStyle = "#eee";
        context.lineWidth = 1;
        context.stroke();
    }

    drawNode(context, node) {
        context.beginPath();
        context.arc(node.position.x, node.position.y, 2, 0, 2 * PI, false);
        context.fillStyle = "#fff";
        context.fill();
    }

    render(context) {
        super.render(context);

        if (!CONSTANTS.DEBUG_MODE) {
            return;
        }

        const drawnEdges = new Set();
        context.translate(this.position.x, this.position.y);
        for (const [key, node] of this.nodes) {
            for (const neighbourKey in node.neighbours) {
                const edgeId = [key, neighbourKey].sort().join("-");
                if (drawnEdges.has(edgeId)) {
                    continue;
                }
                const neighbour = this.nodes.get(String(neighbourKey));
                if (!neighbour) {
                    continue;
                }
                this.drawEdge(context, node, neighbour);
                drawnEdges.add(edgeId);
            }
        }

        for (let i = 0; i < this.list.length; i++) {
            this.drawNode(context, this.list[i]);
        }
    }
}

export {Tree}