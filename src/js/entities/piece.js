// Piece / General purpose entity that goes along with the tree system
// Called it piece for BGE but I think I'll change it in the future

class Piece extends Entity{
    constructor(id, spriteManager = false, frame = 0, tree = false) {
        super()
        this.position = {x: 0, y: 0};
        this.id = id;
        this.frame = frame;
        this.colour = "white";
        this.spriteManager = spriteManager;

        this.tree = tree;
        this.collisionLayers = new Set([1]);
        this.collisionEvents = [];

        this.anchor = tree ? "0" : null;
        this.offsets = tree ? [{x: 0, y: 0}] : [];
        this.nodes = new Set();
        this.frames = new Map();

        this.visualOffset = {x: 0, y: 0};
        this.moveAnimation = null;
        this.rotationAnimation = null;
        this.rotationSetting = {
            animation: null,
            duration: 0
        }
        this.movementSetting = {
            animation: null, 
            duration: 0
        }
    }
    // generate piece function post offset defining.
    generate() {
        this.frames = new Map();
        const nodes = this.getPieceNodes()
        if (!nodes) return false
        this.nodes = new Set(nodes)
        for (let i = 0; i < nodes.length; i++) {
            this.frames.set(String(nodes[i]), this.frame)
        }
        for (const nodeId of nodes) {
            this.tree.nodes.get(String(nodeId)).entities.add(this)
        }
        this.tree.addEntity(this)
        const anchor = this.tree.nodes.get(String(this.anchor))
        this.position.x = anchor.position.x
        this.position.y = anchor.position.y
    }

    rebuildOffsets() {
        if (!this.tree || !this.tree.system) return false;
        if (!this.ensureAnchor()) {
            this.offsets = [];
            return false;
        }
        const anchor = this.tree.nodes.get(String(this.anchor));
        if (!anchor) return false;
        this.offsets = [];
        for (const nodeId of this.nodes) {
            const node = this.tree.nodes.get(String(nodeId));
            if (!node) continue;
            this.offsets.push(
                this.tree.system.getOffset(node.coordinate, anchor.coordinate)
            );
        }
        return true;
    }
    animateNodes(startPositions, targetPositions, duration = 0.15, movementFunction = MOVEMENT.easeInOut) {
        this.moveAnimation = {
            startPositions: new Map(startPositions),
            targetPositions: new Map(targetPositions),
            duration: Math.max(duration, 0.0001),
            elapsed: 0,
            movementFunction: movementFunction
        };
    }
    animateRotation(blocks, startAnchor, targetAnchor, angle, duration = 0.15, movementFunction = MOVEMENT.easeInOut) {
        this.rotationAnimation = {
            blocks: blocks,
            startAnchor: {
                x: startAnchor.x,
                y: startAnchor.y
            },
            targetAnchor: {
                x: targetAnchor.x,
                y: targetAnchor.y
            },
            angle: angle,
            duration: Math.max(duration, 0.0001),
            elapsed: 0,
            movementFunction: movementFunction
        };

        this.moveAnimation = null;
    }
    getVisualNodePosition(nodeId) {
        const node = this.tree.nodes.get(String(nodeId));

        if (!node) {
            return null;
        }
        const position = this.tree.getWorldPosition(node);
        if (!this.moveAnimation) {
            return {
                x: position.x,
                y: position.y
            };
        }
        const start = this.moveAnimation.startPositions.get(
            String(nodeId)
        );
        const target = this.moveAnimation.targetPositions.get(
            String(nodeId)
        );

        if (!start || !target) {
            return {
                x: position.x,
                y: position.y
            };
        }

        const t = Math.min(
            this.moveAnimation.elapsed /
            this.moveAnimation.duration,
            1
        );

        const eased =
            this.moveAnimation.movementFunction(t);

        return {
            x: start.x +
                (target.x - start.x) * eased,

            y: start.y +
                (target.y - start.y) * eased
        };
    }
    getPieceNodes() {
        if (!this.tree || !this.tree.system) return false;
        const anchor = this.tree.nodes.get(String(this.anchor));
        if (!anchor) return false;
        const nodes = [];
        for (const offset of this.offsets) {
            const coordinate = this.tree.system.translate(anchor.coordinate, offset);
            const node = this.tree.getNodeAt(coordinate);
            if (!node) return false;
            nodes.push(String(node.id));
        }

        return nodes;
    }
    deleteNodes(nodeIds) {
        if (!this.tree) return false;
        if (!Array.isArray(nodeIds)) nodeIds = [nodeIds];
        const idsToDelete = new Set(nodeIds.map(id => String(id)));
        const remainingNodes = [];
        const remainingFrames = new Map();
        for (const nodeId of this.nodes) {
            if (idsToDelete.has(String(nodeId))) {
                const node = this.tree.nodes.get(String(nodeId));
                if (node) node.entities.delete(this);
                continue;
            }
            remainingNodes.push(String(nodeId));
            remainingFrames.set(String(nodeId), this.frames.get(String(nodeId)));
        }
        this.nodes = new Set(remainingNodes);
        this.frames = remainingFrames;
        if (this.nodes.size === 0) {
            this.anchor = null;
            this.tree.removeEntity(this);
            this.offsets = [];
            return true;
        }

        this.ensureAnchor();
        this.rebuildOffsets();
        return true;
    }

    ensureAnchor() {
        if (this.nodes.has(String(this.anchor))) {
            return true;
        }

        const firstNode = this.nodes.values().next().value;
        if (firstNode === undefined) {
            this.anchor = null;
            return false;
        }

        this.anchor = String(firstNode);
        return true;
    }

    checkCollisionLayer(layer, nodes = this.getPieceNodes()) {
        if (!nodes || !this.tree) return;
        const collisions = [];

        for (const nodeId of nodes) {
            const node = this.tree.nodes.get(String(nodeId));
            if (!node) continue;
            for (const entity of node.entities) {
                if (entity === this) continue;
                if (entity.collisionLayers.has(layer) && !collisions.includes(entity)) {
                    collisions.push(entity)
                }
            }
        }
        return collisions;
    }

    onCollisionLayer(layer, callback, options = {}) {
        if(typeof callback !== "function" || layer < 1 || layer > 10) {
            return false;
        }
        const event = {
            layer: layer, 
            callback: callback,
            block: options.block !== false
        };
        this.collisionEvents.push(event);
        return event;
    }

    rotate(orientation, wallKick = false) {
        if (!orientation || !this.tree?.system) {
            return false;
        }

        const oldAnchor = this.anchor;
        const oldAnchorNode = this.tree.nodes.get(String(oldAnchor));
        if (!oldAnchorNode) {
            return false;
        }

        const oldNodes = [...this.nodes];
        const oldFrames = new Map(this.frames);
        const oldOffsets = [...this.offsets];

        /*
            IMPORTANT:

            Each index represents the same block.

            oldOffsets[0] -> oldNodes[0] -> oldFrames[oldNodes[0]]
            oldOffsets[1] -> oldNodes[1] -> oldFrames[oldNodes[1]]
            etc.
        */

        const oldVisualPositions = oldNodes.map(nodeId => {
            return this.getVisualNodePosition(nodeId);
        });

        const oldVisualAnchor = this.getVisualNodePosition(oldAnchor);

        if (!oldVisualAnchor) {
            return false;
        }

        const newOffsets = [];
        for (const offset of oldOffsets) {
            const rotated = this.tree.system.rotateOffset(offset, orientation);
            if (!rotated) {
                return false;
            }

            newOffsets.push(rotated);
        }
        const kickOffsets = wallKick ? this.tree.system.surroundingOffsets(orientation, this) : [null];
        if (!Array.isArray(kickOffsets) || kickOffsets.length === 0) {
            return false;
        }
        this.offsets = newOffsets;
        let selectedNodeIds = null;
        let selectedAnchor = null;

        for (const kick of kickOffsets) {
            let candidateAnchor = oldAnchorNode;
            if (kick) {
                const kickCoordinate = this.tree.system.translate(oldAnchorNode.coordinate, kick);
                candidateAnchor = this.tree.getNodeAt(kickCoordinate);
            }
            if (!candidateAnchor) {
                continue;
            }
            this.anchor = String(candidateAnchor.id);
            const candidateNodes = this.getPieceNodes();
            if (!candidateNodes) {
                continue;
            }
            let blocked = false;
            for (const event of this.collisionEvents) {
                const collisions = this.checkCollisionLayer(event.layer, candidateNodes) || [];

                if (collisions.length > 0 && event.block) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) {
                continue;
            }
            selectedNodeIds = candidateNodes;
            selectedAnchor = candidateAnchor;

            break;
        }

        if (!selectedNodeIds) {
            this.anchor = oldAnchor;
            this.offsets = oldOffsets;
            for (const event of this.collisionEvents) {
                const collisions =
                    this.checkCollisionLayer(event.layer, this.getPieceNodes()) || [];
                for (const entity of collisions) {
                    event.callback(entity, this);
                }
            }

            return false;
        }
        const newAnchorPosition = this.tree.getWorldPosition(selectedAnchor);
        let angle = 0;

        for (let i = 0; i < oldOffsets.length; i++) {
            const oldOffset = oldOffsets[i];
            if (oldOffset.x === undefined || oldOffset.y === undefined) {
                continue;
            }
            if (oldOffset.x === 0 && oldOffset.y === 0) {
                continue;
            }
            const newOffset = newOffsets[i];
            const oldAngle = Math.atan2(oldOffset.y, oldOffset.x);
            const newAngle = Math.atan2(newOffset.y, newOffset.x);
            angle = newAngle - oldAngle;
            if (angle > Math.PI) {
                angle -= Math.PI * 2;
            }
            if (angle < -Math.PI) {
                angle += Math.PI * 2;
            }
            break;
        }
        this.anchor = String(selectedAnchor.id);

        this.position.x = selectedAnchor.position.x;
        this.position.y = selectedAnchor.position.y;
        for (const event of this.collisionEvents) {
            const collisions =
                this.checkCollisionLayer(
                    event.layer,
                    selectedNodeIds
                ) || [];

            for (const entity of collisions) {
                event.callback(entity, this);
            }
        }

        this.deleteOldNodes(oldNodes);
        this.updatePosition(oldNodes, oldFrames);

        const blocks = [];

        for (let i = 0; i < selectedNodeIds.length; i++) {
            const newNodeId = String(selectedNodeIds[i]);
            const newNode = this.tree.nodes.get(newNodeId);
            const start = oldVisualPositions[i];

            if (!newNode || !start) {
                continue;
            }

            const target = this.tree.getWorldPosition(newNode);

            blocks.push({
                start: {
                    x: start.x,
                    y: start.y
                },
                target: {
                    x: target.x,
                    y: target.y
                },
                frame: oldFrames.get(
                    String(oldNodes[i])
                ),
                offset: oldOffsets[i],
                newOffset: newOffsets[i]
            });
        }
        if(this.rotationSetting.animation !== null) {
            this.animateRotation(blocks, oldVisualAnchor, newAnchorPosition, angle, this.rotationSetting.duration, this.rotationSetting.animation);
        }
        return true;
    }

    join(node) {
        
    }

    deleteOldNodes(oldNodes) {
        for (const nodeId of oldNodes) {
            const node = this.tree.nodes.get(String(nodeId));
            if (node) {
                node.entities.delete(this);
            }
        }
    }

    move(direction, collisionTags) {
        if (!direction || !this.tree?.system) return false;
        const anchor = this.tree.nodes.get(String(this.anchor));
        if (!anchor) return false;
        const targetCoordinate = this.tree.system.getNeighbourCoordinate(anchor.coordinate, direction);
        const targetNode = this.tree.getNodeAt(targetCoordinate);
        if (!targetNode) return false;
        return this.moveTo(targetNode.id, collisionTags);
    }
    moveTo(targetNode) {
        const oldNodes = [...this.nodes];
        const oldFrames = new Map(this.frames);

        const oldAnchor = this.anchor;
        const oldAnchorNode =
        this.tree.nodes.get(String(this.anchor));
        if (!oldAnchorNode) {
            return false;
        }
        const oldVisualPositions = oldNodes.map(nodeId => this.getVisualNodePosition(nodeId));
        this.anchor = String(targetNode);
        const newNodes = this.getPieceNodes();
        if (!newNodes) {
            this.anchor = oldAnchor;
            return false;
        }
        for (const event of this.collisionEvents) {
            const collisions = this.checkCollisionLayer(event.layer,newNodes) || [];
            for (const entity of collisions) {
                event.callback(entity, this);
                if (event.block) {
                    this.anchor = oldAnchor;
                    return false;
                }
            }
        }
        const anchor = this.tree.nodes.get(String(targetNode));
        if (!anchor) {
            this.anchor = oldAnchor;
            return false;
        }
        this.position.x = anchor.position.x;
        this.position.y = anchor.position.y;

        this.deleteOldNodes(oldNodes);
        this.updatePosition(oldNodes, oldFrames);

        const startPositions = new Map();
        const targetPositions = new Map();
        for (let i = 0; i < newNodes.length; i++) {
            const newNodeId = String(newNodes[i]);
            const newNode = this.tree.nodes.get(newNodeId);
            const start = oldVisualPositions[i];
            if (!newNode || !start) {
                continue;
            }
            const target = this.tree.getWorldPosition(newNode);
            startPositions.set(newNodeId, {x: start.x, y: start.y});
            targetPositions.set(newNodeId, {x: target.x, y: target.y});
        }

        if(this.movementSetting.animation != null) {
            this.animateNodes(startPositions, targetPositions, this.movementSetting.duration, this.movementSetting.animation);
        }
        return true;
    }
    onCollision(target, callback, options = {}) {
        if (typeof callback !== "function") {
            return false;
        }
        const event = {
            target: target,
            callback: callback,
            block: options.block !== false
        };

        this.collisionEvents.push(event);
        return event;
    }

    removeCollision(event) {
        this.collisionEvents = this.collisionEvents.filter(
            collisionEvent => collisionEvent !== event
        );
    }

    updatePosition(oldNodes, oldFrames) {
        const newNodes = this.getPieceNodes();
        if (!newNodes || !this.tree) return false;
        for (const nodeId of newNodes) {
            this.tree.nodes.get(nodeId).entities.add(this);
        }
        this.nodes = new Set(newNodes);
        this.frames = new Map();
        for (let i = 0; i < newNodes.length; i++) {
            const oldNodeId = oldNodes[i];
            const newNodeId = newNodes[i];
            const frame = oldFrames.get(String(oldNodeId));
            if (frame !== undefined) {
                this.frames.set(String(newNodeId), frame);
            }
        }
    }
    render(context) {
        super.render(context);
        if (!this.spriteManager || !this.tree) {
            return;
        }

        if (this.rotationAnimation) {
            const animation = this.rotationAnimation;
            const t = Math.min(animation.elapsed / animation.duration, 1);

            const eased = animation.movementFunction(t);
            const anchorX = animation.startAnchor.x + (animation.targetAnchor.x - animation.startAnchor.x) * eased;
            const anchorY = animation.startAnchor.y + (animation.targetAnchor.y - animation.startAnchor.y) * eased;

            const angle = animation.angle * eased;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            for (const block of animation.blocks) {
                const relativeX = block.start.x - animation.startAnchor.x;
                const relativeY = block.start.y - animation.startAnchor.y;
                const rotatedX = relativeX * cos - relativeY * sin;
                const rotatedY = relativeX * sin + relativeY * cos;
                const x = anchorX + rotatedX;
                const y = anchorY + rotatedY;

                context.save();
                context.translate(x + this.spriteManager.spriteWidth / 2, y + this.spriteManager.spriteHeight / 2);
                context.rotate(angle);
                this.spriteManager.renderSprite(-this.spriteManager.spriteWidth / 2, -this.spriteManager.spriteHeight / 2, block.frame, this.colour);

                context.restore();
            }

            return;
        }

        for (const nodeId of this.nodes) {
            const position = this.getVisualNodePosition(nodeId);
            if (!position) {
                continue;
            }
            const frame = this.frames.get(String(nodeId));
            this.spriteManager.renderSprite(position.x, position.y, frame, this.colour);
        }
    }
    process(dt) {
        if (this.rotationAnimation) {
            this.rotationAnimation.elapsed += dt;
            if (this.rotationAnimation.elapsed >= this.rotationAnimation.duration) {
                this.rotationAnimation = null;
            }

            return;
        }

        if (this.moveAnimation) {
            this.moveAnimation.elapsed += dt;
            if (this.moveAnimation.elapsed >= this.moveAnimation.duration) {
                this.moveAnimation = null;
            }
        }
    }
}

export { Piece }