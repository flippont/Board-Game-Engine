import { Camera } from "./entities/camera.js"

class Scene {
    constructor() {
        this.entities = new Set();
        this.tags = new Map();
        this.camera;
    }
    
    add(entity) {
        if (this.entities.has(entity)) return;
        this.entities.add(entity);
        entity.scene = this;

        for (const tag of entity.tags) {
            if(!this.tags.has(tag)) {
                this.tags.set(tag, new Set([entity]))
            } else {
                this.tags.get(tag).add(entity)
            }
        }
    }

    remove(entity) {
        this.entities.delete(entity);
        for (const tag of entity.tags) {
            if(this.tags.has(tag)) {
                this.tags.get(tag).delete(entity)
            }
        }
    }

    tag(tag) {
        return this.tags.get(tag) || []
    }

    removeTags(entity, tagName) {
        if(this.tags.has(tagName)) {
            this.tags.get(tagName).delete(entity)
        }
    }
    process(dt) {
    }
    update(context, dt) {
        for (const entity of this.entities) {
            context.save()
            context.scale(this.camera.zoom, this.camera.zoom);
            context.translate(
                canvas.width / 2 / this.camera.zoom - this.camera.x, 
                canvas.height / 2 / this.camera.zoom - this.camera.y,
            );
            entity.render(context);
            entity.process(dt);
            context.restore()
        }
    }
    static changeScene(sceneToUpdate) {
        scenes = []
        DOWN = {}
        Scene.new(sceneToUpdate)
    }
    static new() {
        let newScene = new Scene()
        let sceneCamera = new Camera()
        newScene.add(sceneCamera)
        newScene.camera = sceneCamera
        scenes.push(newScene);
    }
}

export { Scene }