// spriteOrder = ["0","1","2","3",...,"x","y","z"]

class TextManager extends Entity{
    constructor(spriteManager, context, spriteOrder = "") {
        super()
        if(spriteManager) {
            this.spriteManager = spriteManager
        }
        this.spriteOrder = spriteOrder.split("")
        this.context = context;
        this.textData = []
    }

    render() {
        super.render();
        let textLength = 0
        for (let i=0; i<this.textData.length; i++) {
            let textData = this.textData[i]
            this.drawText(
                textData.text, 
                textData.x, 
                textData.y, 
                textData.maxWidth, 
                textData.letterGap, 
                textData.lineGap, 
                textData.colour,
                textData.font
            )
        }
    }

    // Bad code. Will fix
    addText(text, x, y, maxWidth, letterGap, lineGap, colour, font) {
        this.textData.push({
            text: text,
            x: x,
            y: y,
            maxWidth: maxWidth,
            letterGap: (letterGap) ? letterGap : 0,
            lineGap: (lineGap) ? lineGap : 0,
            colour: (colour) ? colour: "white",
            font: (font) ? font : false
        })
    }

    drawText(text, x, y, maxWidth, letterGap, lineGap, colour, font) {
        let lines = 0;
        let xPos = floor(x);
        const words = text.split(" ");
        for (const word of words) {
            let wordWidth = 0;
            for (const letter of word) { 
                wordWidth += (this.spriteManager) ? this.spriteManager.spriteWidth + letterGap : this.context.measureText(letter).width + letterGap;
            }
            if (xPos > x && xPos + wordWidth > maxWidth) {
                lines++;
                xPos = floor(x);
            }
            for (const letter of word) {
                let letterWidth = (this.spriteManager) ? this.spriteManager.spriteWidth : this.context.measureText(letter).width;
                this.drawLetter(letter, xPos, y + (this.spriteManager.spriteHeight + lineGap) * lines, colour, font);
                xPos += letterWidth + letterGap;
            }
            xPos += this.spriteManager ? this.spriteManager.spriteWidth + letterGap : this.context.measureText(" ").width + letterGap;
        }
    }
    
    drawLetter(letter, x, y, colour, font) {
        if(this.spriteManager) {
            this.spriteManager.renderSprite(x, y, this.spriteOrder.indexOf(letter), (colour) ? colour : "white")
        } else {
            this.context.fillStyle = (colour) ? colour : "white";
            this.context.font = (font) ? font : "normal 12px Arial";
            this.context.fillText(letter, x, y)
        }
    }
}


export {TextManager}