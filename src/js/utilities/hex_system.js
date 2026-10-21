class HexSystem {
    constructor() {
        this.name = "hex";
    }

    getKey(coordinate) {
        return `${coordinate.q},${coordinate.r},${coordinate.s}`;
    }

    fromArgs(q, r, s) {
        return { q, r, s };
    }

    translate(coordinate, offset) {
        return {
            q: coordinate.q + offset.q,
            r: coordinate.r + offset.r,
            s: coordinate.s + offset.s
        };
    }

    getNeighbourCoordinate(coordinate, direction) {
        return this.translate(coordinate, direction);
    }

    getOffset(coordinate, anchor) {
        return {
            q: coordinate.q - anchor.q,
            r: coordinate.r - anchor.r,
            s: coordinate.s - anchor.s
        };
    }

    rotateOffset(offset, orientation) {
        return orientation(offset.q, offset.r, offset.s);
    }

    surroundingOffsets(offset, orientation) {

    }
}

export {HexSystem}