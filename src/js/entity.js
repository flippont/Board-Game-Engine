class Entity {
    constructor() {
        this.x = this.y = this.age = 0;
        this.tags = []
    }
    process(dt) {
    }
    render(context) {
    }
    hasTag(tag) {
        return this.tags.includes(tag);
    }

    hasAnyTag(tags) {
        if (!Array.isArray(tags)) {
            tags = [tags];
        }
        for (const tag of tags) {
            if (this.tags.includes(tag)) {
                return true;
            }
        }
        return false;
    }
}


export { Entity }