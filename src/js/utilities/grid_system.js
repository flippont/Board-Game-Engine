
class GridSystem {
    constructor() {
        this.name = "grid"
    }

    getKey(coordinate) {
        return `${coordinate.x},${coordinate.y}`;
    }

    fromArgs(x, y) {
        return { x, y };
    }

    translate(coordinate, offset) {
        return {
            x: coordinate.x + offset.x,
            y: coordinate.y + offset.y
        };
    }

    getNeighbourCoordinate(coordinate, direction) {
        return this.translate(coordinate, direction);
    }

    getOffset(coordinate, anchor) {
        return {
            x: coordinate.x - anchor.x,
            y: coordinate.y - anchor.y
        };
    }

    rotateOffset(offset, orientation) {
        return orientation(offset.x, offset.y);
    }

    surroundingOffsets(orientation, piece) {
        return [
            { x: 0, y: 0 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
            { x: 1, y: 1 }
        ];
    }
}

export {GridSystem}