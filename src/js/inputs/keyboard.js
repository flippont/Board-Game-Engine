let DOWN = {};
let PRESSED = {};

onkeydown = (e) => {
    if (!DOWN[e.keyCode]) {
        PRESSED[e.keyCode] = true;
    }
    DOWN[e.keyCode] = true;
    if ([32, 37, 38, 39, 40].includes(e.keyCode)) {
        e.preventDefault();
    }
};

onkeyup = (e) => {
    DOWN[e.keyCode] = false;
};

window.addEventListener("blur", () => {
    DOWN = {};
    PRESSED = {};
});
