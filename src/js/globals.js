const CONSTANTS = {
    DEBUG_MODE: false,
};


const GRID_DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    upleft: { x: -1, y: 1 },
    upright: { x: 1, y: 1 },
    downleft: { x: -1, y: -1 },
    downright: { x: 1, y: -1 }
}

const GRID_ROTATIONS = {
    clockwiseRightAngle: (x, y) => {
        return { x: y, y: -x}
    },
    anticlockwiseRightAngle: (x, y) => {
        return {x: -y, y: x}
    }
}

const HEX_ROTATIONS = {
    clockwise: (q, r, s) => { 
        return{ q: -r, r: -s, s: -q } 
    },
    anticlockwise: (q, r, s) => {
        return{ q: -s, r: -q, s: -r }
    }
}

const HEX_DIRECTIONS = {
    up: { q: 0, r: -1, s: 1},
    down:  { q: 0, r: 1, s: -1},
    upLeft: { q: -1, r: 0, s: 1},
    upRight: { q: 1, r: -1, s: 0},
    downLeft: { q: -1, r: 1, s: 0},
    downRight: { q: 1, r: 0, s: -1}
}

const KEYBOARD = {
    TAB : 9,
    ENTER : 13,
    SHIFT : 16,
    CTRL : 17,
    ESC : 27,
    SPACE : 32,
    LEFT : 37,
    UP : 38,
    RIGHT : 39,
    BACKSPACE : 8,
    COMMAND : 224,
    DOWN : 40,
    DELETE : 46,
    NUM_0 : 48,
    NUM_1 : 49,
    NUM_2 : 50,
    NUM_3 : 51,
    NUM_4 : 52,
    NUM_5 : 53,
    NUM_6 : 54,
    NUM_7 : 55,
    NUM_8 : 56,
    NUM_9 : 57,
    A : 65,
    B : 66,
    C : 67,
    D : 68,
    E : 69,
    F : 70,
    G : 71,
    H : 72,
    I : 73,
    J : 74,
    K : 75,
    L : 76,
    M : 77,
    N : 78,
    O : 79,
    P : 80,
    Q : 81,
    R : 82,
    S : 83,
    T : 84,
    U : 85,
    V : 86,
    W : 87,
    X : 88,
    Y : 89,
    Z : 90
}

const COLLISION_LAYERS = {
    LAYER_1: 1,
    LAYER_2: 2,
    LAYER_3: 3,
    LAYER_4: 4,
    LAYER_5: 5,
    LAYER_6: 6,
    LAYER_7: 7,
    LAYER_8: 8,
    LAYER_9: 9,
    LAYER_10: 10
};

const MOVEMENT = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => 1 - Math.pow(1 - t, 2),
    easeInOut: t =>
        t < 0.5
            ? 2 * t * t
            : 1 - Math.pow(-2 * t + 2, 2) / 2
};

const COLOURS = {
    "red": [255, 0, 0],
    "orange": [255, 165, 0],
    "yellow": [255, 255, 0],
    "green": [0, 255, 0],
    "blue": [0, 0, 255],
    "purple": [128, 0, 128],
    "pink": [255, 192, 203],
    "cyan": [0, 255, 255],
    "black": [0, 0, 0],
    "brown": [150, 75, 0],
    "white": [255, 255, 255],
    "grey": [100, 100, 100]
}

export {CONSTANTS, GRID_DIRECTIONS, GRID_ROTATIONS, HEX_DIRECTIONS, HEX_ROTATIONS, COLOURS, MOVEMENT, COLLISION_LAYERS, KEYBOARD}