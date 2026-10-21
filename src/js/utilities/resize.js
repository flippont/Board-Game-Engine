function resize() {
    let windowWidth = window.innerWidth,
        windowHeight = window.innerHeight;
    
    let windowRatio = windowWidth / windowHeight,
        canvasRatio = canvas.width / canvas.height;
    
    let containerWidth,
        containerHeight;
    
    if(windowRatio <= canvasRatio) {
        containerWidth = windowWidth
        containerHeight = containerWidth / canvasRatio
    } else {
        containerHeight = windowHeight
        containerWidth = windowHeight * canvasRatio
    }
    container.style.width = containerWidth + "px";
    container.style.height = containerHeight + "px";
}

export { resize }