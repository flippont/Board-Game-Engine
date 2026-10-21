class SpriteManager {
    constructor(context, src, rows, columns, offsetX = 0, offsetY = 0) {
        this.rows = rows;
        this.columns = columns;
        this.offsetX = offsetX;
        this.offsetY = offsetY;

        this.width = 0;
        this.height = 0;
        this.spriteWidth = 0;
        this.spriteHeight = 0;

        this.src = src;
        this.context = context;
        this.image = null;

        this.colourCache = new Map();

        this.loadImage();
    }
    
    loadImage() {
        this.image = new Image()
        this.image.onload = () => {
            this.width = this.image.naturalWidth - this.offsetX;
            this.height = this.image.naturalHeight - this.offsetY;
            this.spriteWidth = this.width / this.columns;
            this.spriteHeight = this.height / this.rows;
            this.colourCache.clear();
        }
        this.image.src = this.src
    }

    renderSprite(x, y, spriteNo, colour = "white", width = this.spriteWidth, height = this.spriteHeight) {
        if (!this.image || !this.image.width) return;

        if (!Number.isFinite(spriteNo)) {
            spriteNo = 0;
        }

        const row = floor(spriteNo / this.columns);
        const column = spriteNo % this.columns;

        const spritePosX =
            this.offsetX + column * this.spriteWidth;

        const spritePosY =
            this.offsetY + row * this.spriteHeight;

        this.context.drawSprite(
            this.image, floor(spritePosX), floor(spritePosY), 
            this.spriteWidth, this.spriteHeight, x, y, width, height, colour
        );
    }
}


export { SpriteManager }