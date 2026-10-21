import { Entity } from "../entity.js"

class Camera extends Entity{
    constructor() {
        super()
        this.x = 0
        this.y = 0
        this.zoom = 1
        this.tags.push("camera")
    }
    render() {
    }
    process(dt) {
        super.process(dt)
    }
}

export { Camera }