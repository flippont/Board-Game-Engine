import { Entity } from "../entity.js"

class Tile extends Entity {
    constructor(spriteManager, sprite, tree, node, colour = "white") {
        super()
        this.spriteManager = spriteManager
        this.sprite = sprite
        this.tree = tree
        this.node = String(node)
        this.colour = colour
    }
    render(context) {
        if (!this.spriteManager || !this.tree) return
        const node = this.tree.nodes.get(this.node)
        if (!node) return
        const position = this.tree.getWorldPosition(node)
        this.spriteManager.renderSprite(
            position.x,
            position.y,
            this.sprite,
            this.colour
        )
    }
}

export { Tile }