const { sqrt, pow, floor, PI, random } = Math

const CONSTANTS = {
    DEBUG_MODE: false,
};

let DOWN = {};
let PRESSED = {};

class WebGLRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl", {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
            ...(options.contextAttributes || {})
        }) || canvas.getContext("experimental-webgl");

        if (!this.gl) {
            throw new Error(
                "WebGL is unavailable. Enable WebGL or use Canvas 2D."
            );
        }

        this.vertexSize = 7;
        this.maxQuads = options.maxQuads || 4096;
        this.vertices = new Float32Array(
            this.maxQuads * 6 * this.vertexSize
        );

        this.vertexCount = 0;
        this.batchTexture = null;
        this.textureCache = new WeakMap();
        this.textTextureCache = new Map();

        this.stateStack = [];
        this.transform = {
            a: 1, b: 0,
            c: 0, d: 1,
            e: 0, f: 0
        };

        this.fillStyle = "white";
        this.strokeStyle = "white";
        this.lineWidth = 1;
        this.font = "normal 12px Arial";
        this.textAlign = "left";
        this.textBaseline = "alphabetic";
        this.imageSmoothingEnabled = false;
        this._path = [];
        this._activePath = null;
        this._closedPaths = new Set();

        this._textCanvas = document.createElement("canvas");
        this._textContext = this._textCanvas.getContext("2d");
        this._whiteCanvas = document.createElement("canvas");
        this._whiteCanvas.width = 1;
        this._whiteCanvas.height = 1;

        const whiteContext = this._whiteCanvas.getContext("2d");
        whiteContext.fillStyle = "white";
        whiteContext.fillRect(0, 0, 1, 1);

        this._createProgram();
        this._createBuffer();
        this._syncViewport();

        const gl = this.gl;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

        gl.clearColor(0, 0, 0, 0);
    }

    _createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader) || "Unknown shader compilation error";
            gl.deleteShader(shader);
            throw new Error(
                `WebGL shader compilation failed: ${message}`
            );
        }
        return shader;
    }

    _createProgram() {
        const gl = this.gl;
        const vertexShader = this._createShader(
            gl.VERTEX_SHADER,
            `
                attribute vec2 a_position;
                attribute vec2 a_uv;
                attribute vec3 a_tint;

                varying vec2 v_uv;
                varying vec3 v_tint;

                void main() {
                    gl_Position = vec4(a_position, 0.0, 1.0);
                    v_uv = a_uv;
                    v_tint = a_tint;
                }
            `
        );

        const fragmentShader = this._createShader(
            gl.FRAGMENT_SHADER,
            `
                precision mediump float;

                uniform sampler2D u_texture;

                varying vec2 v_uv;
                varying vec3 v_tint;

                void main() {
                    vec4 texel = texture2D(u_texture, v_uv);

                    gl_FragColor = vec4(
                        texel.rgb * v_tint,
                        texel.a
                    );
                }
            `
        );

        this.program = gl.createProgram();

        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error("WebGL program linking failed: " + gl.getProgramInfoLog(this.program));
        }

        gl.useProgram(this.program);

        this.attributes = {
            position: gl.getAttribLocation(
                this.program, "a_position"
            ),
            uv: gl.getAttribLocation(
                this.program, "a_uv"
            ),
            tint: gl.getAttribLocation(
                this.program, "a_tint"
            )
        };

        this.uniforms = {
            texture: gl.getUniformLocation(
                this.program, "u_texture"
            )
        };

        gl.uniform1i(this.uniforms.texture, 0);
    }

    _createBuffer() {
        const gl = this.gl;
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);

        const stride = this.vertexSize * Float32Array.BYTES_PER_ELEMENT;

        gl.enableVertexAttribArray(this.attributes.position);
        gl.vertexAttribPointer(this.attributes.position, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(this.attributes.uv);
        gl.vertexAttribPointer(this.attributes.uv, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
        gl.enableVertexAttribArray(this.attributes.tint);
        gl.vertexAttribPointer(this.attributes.tint, 3, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
    }

    _syncViewport() {
        const gl = this.gl;
        const width = Math.max(1, this.canvas.width);
        const height = Math.max(1, this.canvas.height);

        if (this._viewportWidth !== width || this._viewportHeight !== height) {
            gl.viewport(0, 0, width, height);
            this._viewportWidth = width;
            this._viewportHeight = height;
        }
    }

    beginFrame() {
        this._syncViewport();
    }

    clearRect(x = 0, y = 0, width = this.canvas.width, height = this.canvas.height) {
        this.flush();
        this._syncViewport();
        const gl = this.gl;
        if (x <= 0 && y <= 0 && width >= this.canvas.width && height >= this.canvas.height) {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return;
        }
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(
            Math.max(0, Math.floor(x)),
            Math.max(0, Math.floor(this.canvas.height - y - height)),
            Math.max(0, Math.ceil(width)),
            Math.max(0, Math.ceil(height))
        );

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);
    }

    save() {
        this.stateStack.push({
            transform: { ...this.transform },
            fillStyle: this.fillStyle,
            strokeStyle: this.strokeStyle,
            lineWidth: this.lineWidth,
            font: this.font,
            textAlign: this.textAlign,
            textBaseline: this.textBaseline
        });
    }

    restore() {
        const state = this.stateStack.pop();
        if (!state) return;
        this.transform = state.transform;
        this.fillStyle = state.fillStyle;
        this.strokeStyle = state.strokeStyle;
        this.lineWidth = state.lineWidth;
        this.font = state.font;
        this.textAlign = state.textAlign;
        this.textBaseline = state.textBaseline;
    }

    translate(x, y) {
        const m = this.transform;
        m.e += m.a * x + m.c * y;
        m.f += m.b * x + m.d * y;
    }

    scale(x, y = x) {
        const m = this.transform;
        m.a *= x;
        m.b *= x;
        m.c *= y;
        m.d *= y;
    }

    rotate(angle) {
        const m = this.transform;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const { a, b, c, d } = m;
        m.a = a * cos + c * sin;
        m.c = -a * sin + c * cos;
        m.b = b * cos + d * sin;
        m.d = -b * sin + d * cos;
    }

    _transformPoint(x, y) {
        const m = this.transform;
        const worldX = m.a * x + m.c * y + m.e;
        const worldY = m.b * x + m.d * y + m.f;
        const width = Math.max(1, this.canvas.width);
        const height = Math.max(1, this.canvas.height);
        return {
            x: worldX / width * 2 - 1,
            y: 1 - worldY / height * 2
        };
    }

    _getTexture(source) {
        if (!source || (typeof source !== "object" && typeof source !== "function")) {
            return null;
        }

        const width = source.naturalWidth || source.videoWidth || source.width || 0;
        const height = source.naturalHeight || source.videoHeight || source.height || 0;
        if (!width || !height) return null;
        const cached = this.textureCache.get(source);
        if (cached) return cached;

        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } catch (error) {
            gl.deleteTexture(texture);
            console.warn(
                "Could not upload image to WebGL. " + 
                "Check that it has loaded and allows cross-origin use.", error);
            return null;
        }

        const entry = {
            texture,
            width,
            height
        };

        this.textureCache.set(source, entry);

        return entry;
    }

    _parseColour(colour) {
        if (Array.isArray(colour) && colour.length >= 3) {
            const divisor = Math.max(colour[0], colour[1], colour[2]) <= 1 ? 1 : 255;
            return [colour[0] / divisor, colour[1] / divisor, colour[2] / divisor];
        }

        if (colour && typeof colour === "object" && "r" in colour && "g" in colour && "b" in colour) {
            return [colour.r, colour.g, colour.b].map(value => value > 1 ? value / 255 : value);
        }

        if (typeof colour !== "string") {
            return [1, 1, 1];
        }

        const value = colour.trim().toLowerCase();

        if (typeof COLOURS !== "undefined" && COLOURS[value]) {
            return COLOURS[value].map(component => component / 255);
        }

        let match = /^#([0-9a-f]{3})$/i.exec(value);
        if (match) {
            return match[1].split("").map(char => parseInt(char + char, 16) / 255);
        }

        match = /^#([0-9a-f]{6})$/i.exec(value);
        if (match) {
            return [0, 2, 4].map(index => parseInt(match[1].slice(index, index + 2), 16) / 255);
        }

        match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
        if (match) {
            return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
        }

        return [1, 1, 1];
    }

    _setBatchTexture(texture) {
        if (this.batchTexture === texture) return;

        this.flush();
        this.batchTexture = texture;
        const gl = this.gl;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
    }

    _ensureCapacity(vertexTotal) {
        if (this.vertexCount + vertexTotal <= this.vertices.length / this.vertexSize) {
            return;
        }

        this.flush();
    }

    _writeVertex(x, y, u, v, tint) {
        const point = this._transformPoint(x, y);
        let index = this.vertexCount * this.vertexSize;

        this.vertices[index++] = point.x;
        this.vertices[index++] = point.y;
        this.vertices[index++] = u;
        this.vertices[index++] = v;
        this.vertices[index++] = tint[0];
        this.vertices[index++] = tint[1];
        this.vertices[index++] = tint[2];
        this.vertexCount++;
    }

    _queueTriangle(textureEntry, points, uvs, tint) {
        if (!textureEntry) return;
        this._setBatchTexture(textureEntry.texture);
        this._ensureCapacity(3);

        for (let i = 0; i < 3; i++) {
            this._writeVertex(points[i].x, points[i].y, uvs[i][0], uvs[i][1], tint);
        }
    }

    _queueQuad(textureEntry, x, y, width, height, u0, v0, u1, v1, tint) {
        if (!textureEntry) return;
        const x2 = x + width;
        const y2 = y + height;

        const topLeft = { x, y };
        const topRight = { x: x2, y };
        const bottomLeft = { x, y: y2 };
        const bottomRight = { x: x2, y: y2 };

        this._setBatchTexture(textureEntry.texture);
        this._ensureCapacity(6);

        this._writeVertex(topLeft.x, topLeft.y, u0, v0, tint);
        this._writeVertex(topRight.x, topRight.y, u1, v0, tint);
        this._writeVertex(bottomLeft.x, bottomLeft.y, u0, v1, tint);
        this._writeVertex(topRight.x, topRight.y, u1, v0, tint);
        this._writeVertex(bottomRight.x, bottomRight.y, u1, v1, tint);
        this._writeVertex(bottomLeft.x, bottomLeft.y, u0, v1, tint);
    }

    drawSprite(source, sx, sy, sw, sh, dx, dy, dw, dh, colour = "white") {
        const entry = this._getTexture(source);
        if (!entry) return;
        const tint = this._parseColour(colour);
        const u0 = sx / entry.width;
        const v0 = sy / entry.height;
        const u1 = (sx + sw) / entry.width;
        const v1 = (sy + sh) / entry.height;
        this._queueQuad(entry, dx, dy, dw, dh, u0, v0, u1, v1, tint);
    }

    drawImage(source, ...args) {
        const width = source?.naturalWidth || source?.videoWidth || source?.width || 0;

        const height = source?.naturalHeight || source?.videoHeight || source?.height || 0;

        if (args.length === 2) {
            this.drawSprite(source, 0, 0, width, height, args[0], args[1], width, height, "white");
        } else if (args.length === 4) {
            this.drawSprite(source, 0, 0, width, height, args[0], args[1], args[2], args[3], "white");
        } else if (args.length === 8) {
            this.drawSprite(source, args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], "white");
        }
    }

    fillRect(x, y, width, height) {
        const entry = this._getTexture(this._whiteCanvas);
        this._queueQuad(entry, x, y, width, height, 0, 0, 1, 1, this._parseColour(this.fillStyle));
    }

    measureText(text) {
        this._textContext.font = this.font;
        return this._textContext.measureText(String(text));
    }

    _fontPixels() {
        const match = /([\d.]+)px/.exec(this.font);
        return match ? Number(match[1]) : 12;
    }

    fillText(text, x, y, maxWidth) {
        text = String(text);
        if (!text) return;
        const colour = String(this.fillStyle);
        const key =
            `${this.font}\u0000${colour}\u0000` +
            `${this.textAlign}\u0000${this.textBaseline}\u0000${text}`;

        let source = this.textTextureCache.get(key);

        if (!source) {
            this._textContext.font = this.font;
            this._textContext.textAlign = "left";
            this._textContext.textBaseline = "alphabetic";

            const metrics = this._textContext.measureText(text);
            const ascent = Math.ceil(metrics.actualBoundingBoxAscent || this._fontPixels() * 0.8);
            const descent = Math.ceil(metrics.actualBoundingBoxDescent || this._fontPixels() * 0.25);
            const padding = 2;
            const width = Math.max(1, Math.ceil(metrics.width) + padding * 2);
            const height = Math.max(1, ascent + descent + padding * 2);
            const textCanvas = document.createElement("canvas");

            textCanvas.width = width;
            textCanvas.height = height;

            const textContext = textCanvas.getContext("2d");
            textContext.font = this.font;
            textContext.fillStyle = colour;
            textContext.textAlign = "left";
            textContext.textBaseline = "alphabetic";
            textContext.fillText(text, padding, padding + ascent, maxWidth);

            source = {
                canvas: textCanvas,
                ascent,
                descent,
                padding,
                width: metrics.width
            };

            if (this.textTextureCache.size >= 512) {
                const oldestKey = this.textTextureCache.keys().next().value;
                const oldest = this.textTextureCache.get(oldestKey);
                this.textTextureCache.delete(oldestKey);

                // remove text canv here
                void oldest;
            }
            this.textTextureCache.set(key, source);
        }

        let drawX = x;
        if (this.textAlign === "center") {
            drawX -= source.width / 2;
        } else if (this.textAlign === "right" || this.textAlign === "end") {
            drawX -= source.width;
        }

        let baselineY = y;

        if (this.textBaseline === "top" || this.textBaseline === "hanging") {
            baselineY += source.ascent;
        } else if (this.textBaseline === "middle") {
            baselineY += (
                source.ascent - source.descent
            ) / 2;
        } else if (this.textBaseline === "bottom" || this.textBaseline === "ideographic") {
            baselineY -= source.descent;
        }

        const sourceCanvas = source.canvas;

        this.drawSprite(
            sourceCanvas,
            0, 0,
            sourceCanvas.width, sourceCanvas.height,
            drawX - source.padding, baselineY - source.ascent - source.padding,
            sourceCanvas.width, sourceCanvas.height, "white");
    }

    beginPath() {
        this._path = [];
        this._activePath = null;
        this._closedPaths = new Set();
    }

    moveTo(x, y) {
        const path = [{ x, y }];
        this._path.push(path);
        this._activePath = path;
    }

    lineTo(x, y) {
        if (!this._activePath) {
            this.moveTo(x, y);
            return;
        }
        this._activePath.push({ x, y });
    }

    closePath() {
        if (this._activePath && this._activePath.length > 1) {
            this._closedPaths.add(this._activePath);
        }
    }

    arc(x, y, radius, startAngle, endAngle, anticlockwise = false) {
        let sweep = endAngle - startAngle;
        if (!anticlockwise && sweep >= Math.PI * 2) {
            sweep = Math.PI * 2;
        } else if (anticlockwise && sweep <= -Math.PI * 2) {
            sweep = -Math.PI * 2;
        } else if (anticlockwise && sweep > 0) {
            sweep -= Math.PI * 2;
        } else if (!anticlockwise && sweep < 0) {
            sweep += Math.PI * 2;
        }

        const steps = Math.min(96, Math.max(8, Math.ceil(Math.abs(sweep) * Math.max(radius, 1) / 3)));

        const points = [];

        for (let i = 0; i <= steps; i++) {
            const angle = startAngle + sweep * i / steps;
            points.push({
                x: x + Math.cos(angle) * radius,
                y: y + Math.sin(angle) * radius
            });
        }

        if (!this._activePath) {
            this._path.push(points);
            this._activePath = points;
        } else {
            const last = this._activePath[this._activePath.length - 1];
            if (last && (Math.abs(last.x - points[0].x) > 0.001 || Math.abs(last.y - points[0].y) > 0.001)) {
                this._activePath.push(points[0]);
            }
            this._activePath.push(...points.slice(1));
        }
    }

    _whiteTexture() {
        return this._getTexture(this._whiteCanvas);
    }

    _solidTriangle(a, b, c, colour) {
        const tint = this._parseColour(colour);
        const uv = [0.5, 0.5];
        this._queueTriangle(this._whiteTexture(), [a, b, c], [uv, uv, uv], tint);
    }

    stroke() {
        for (const path of this._path) {
            for (let i = 1; i < path.length; i++) {
                this._strokeLine(path[i - 1], path[i]);
            }
            if (this._closedPaths.has(path) && path.length > 2) {
                this._strokeLine(
                    path[path.length - 1],
                    path[0]
                );
            }
        }
    }

    _strokeLine(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.0001) return;

        const half = Math.max(0.5, this.lineWidth / 2);
        const nx = -dy / length * half;
        const ny = dx / length * half;

        const p1 = { x: a.x + nx, y: a.y + ny };
        const p2 = { x: b.x + nx, y: b.y + ny };
        const p3 = { x: a.x - nx, y: a.y - ny };
        const p4 = { x: b.x - nx, y: b.y - ny };

        this._solidTriangle(p1, p2, p3, this.strokeStyle);
        this._solidTriangle(p2, p4, p3, this.strokeStyle);
    }

    fill() {
        for (const path of this._path) {
            if (path.length < 3) continue;
            const origin = path[0];

            for (let i = 1; i < path.length - 1; i++) {
                this._solidTriangle(origin, path[i], path[i + 1], this.fillStyle);
            }
        }
    }

    flush() {
        if (this.vertexCount === 0 || !this.batchTexture) {
            return;
        }

        const gl = this.gl;

        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.batchTexture);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, this.vertexCount * this.vertexSize));
        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
        this.vertexCount = 0;
    }
}

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

// support more input options in the future

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

let scenes = []
let canvas = document.getElementById("canvas");
let container = document.getElementById("canvasContainer")
let context = new WebGLRenderer(canvas);
let lastFrame = performance.now();

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


// Camera Class. General draw calls are reset to the camera for each scene. 
// To bypass this, you make multiple scenes.

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

class GridSystem {
    constructor() {
        this.name = "grid"
    }

    getKey(coordinate) {
        return `${coordinate.x},${coordinate.y}`;
    }

    fromArgs(x, y) {
        return { x, y };
    }

    translate(coordinate, offset) {
        return {
            x: coordinate.x + offset.x,
            y: coordinate.y + offset.y
        };
    }

    getNeighbourCoordinate(coordinate, direction) {
        return this.translate(coordinate, direction);
    }

    getOffset(coordinate, anchor) {
        return {
            x: coordinate.x - anchor.x,
            y: coordinate.y - anchor.y
        };
    }

    rotateOffset(offset, orientation) {
        return orientation(offset.x, offset.y);
    }

    surroundingOffsets(orientation, piece) {
        return [
            { x: 0, y: 0 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
            { x: 1, y: 1 }
        ];
    }
}

class HexSystem {
    constructor() {
        this.name = "hex";
    }

    getKey(coordinate) {
        return `${coordinate.q},${coordinate.r},${coordinate.s}`;
    }

    fromArgs(q, r, s) {
        return { q, r, s };
    }

    translate(coordinate, offset) {
        return {
            q: coordinate.q + offset.q,
            r: coordinate.r + offset.r,
            s: coordinate.s + offset.s
        };
    }

    getNeighbourCoordinate(coordinate, direction) {
        return this.translate(coordinate, direction);
    }

    getOffset(coordinate, anchor) {
        return {
            q: coordinate.q - anchor.q,
            r: coordinate.r - anchor.r,
            s: coordinate.s - anchor.s
        };
    }

    rotateOffset(offset, orientation) {
        return orientation(offset.q, offset.r, offset.s);
    }

    surroundingOffsets(offset, orientation) {

    }
}

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

class Tree extends Entity{
    constructor(x, y, tree, system = null) {
        super()
        this.nodes = new Map();
        this.list = [];
        this.entities = new Set();
        this.coordinates = new Map();
        this.position = {x: x, y: y};

        // Explicit systems are preferred. The fallback keeps the old constructor usable.
        this.system = system || Tree.inferSystem(tree);
        this.calculateNodes(tree);
    }

    static inferSystem(tree) {
        for (const node of Object.values(tree || {})) {
            if (!node?.coordinate) continue;

            if (node.coordinate.x !== undefined && node.coordinate.y !== undefined) {
                return new GridSystem();
            }

            if (
                node.coordinate.q !== undefined &&
                node.coordinate.r !== undefined &&
                node.coordinate.s !== undefined
            ) {
                return new HexSystem();
            }
        }

        throw new Error("Tree requires a CoordinateSystem");
    }

    get type() {
        return this.system?.name || "null";
    }

    getWorldPosition(node) {
        return {
            x: node.position.x + this.position.x,
            y: node.position.y + this.position.y
        };
    }
    addNode(key, node) {
        key = String(key);
        if (this.nodes.has(key)) {
            return;
        }
        node.id = key
        node.entities = new Set();
        this.list.push(node);
        this.nodes.set(key, node);
        this.addCoordinate(node, key);
    }

    addCoordinate(node, key) {
        if (!node.coordinate || !this.system) {
            return;
        }
        this.coordinates.set(
            this.system.getKey(node.coordinate),
            key
        );
    }

    getNodeAt(coordinate, ...args) {
        if (!this.system) return null;
        if (typeof coordinate !== "object" || coordinate === null) {
            coordinate = this.system.fromArgs(coordinate, ...args);
        }
        const key = this.coordinates.get(this.system.getKey(coordinate));
        if (key === undefined) {
            return null;
        }
        return this.nodes.get(String(key)) || null;
    }

    getNodeId(node) {
        return node?.id ?? null;
    }

    addEntity(entity) {
        if (this.entities.has(entity)) {
            return;
        }
        this.entities.add(entity);
    }

    calculateNodes(tree) {
        for (const [key, node] of Object.entries(tree || {})) {
            this.addNode(key, node);
        }
    }
    
    removeEntity(entity) {
        this.entities.delete(entity);
    }

    drawEdge(context, node, neighbour) {
        context.beginPath();
        context.moveTo(node.position.x, node.position.y);
        context.lineTo(neighbour.position.x, neighbour.position.y);
        context.strokeStyle = "#eee";
        context.lineWidth = 1;
        context.stroke();
    }

    drawNode(context, node) {
        context.beginPath();
        context.arc(node.position.x, node.position.y, 2, 0, 2 * PI, false);
        context.fillStyle = "#fff";
        context.fill();
    }

    render(context) {
        super.render(context);

        if (!CONSTANTS.DEBUG_MODE) {
            return;
        }

        const drawnEdges = new Set();
        context.translate(this.position.x, this.position.y);
        for (const [key, node] of this.nodes) {
            for (const neighbourKey in node.neighbours) {
                const edgeId = [key, neighbourKey].sort().join("-");
                if (drawnEdges.has(edgeId)) {
                    continue;
                }
                const neighbour = this.nodes.get(String(neighbourKey));
                if (!neighbour) {
                    continue;
                }
                this.drawEdge(context, node, neighbour);
                drawnEdges.add(edgeId);
            }
        }

        for (let i = 0; i < this.list.length; i++) {
            this.drawNode(context, this.list[i]);
        }
    }
}

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


// Scene class. I don't know WHAT I was smoking
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

function reconstructPath(camerFrom, current) {
    const path = [current];
    while (current in cameFrom) {
        current = cameFrom[current];
        path.unshift(current);
    }

    return path;
}

// From the wikipedia pseudocode
function aStar(tree, startId, goalId) {
    const openSet = new Set([startId])
    const cameFrom = {};
    const gScore = {};
    const fScore = {};

    for (const id in tree) {
        // the g score is the known shortest length
        gScore[id] = Infinity;
        // the f score is the g score + the heuristic (as the crow flies)
        fScore[id] = Infinity;
    }

    gScore[startId] = 0;
    fScore[startId] = heuristic(tree[startId, tree[goalId]])

    while (openSet.size > 0) {
        let current = null;
        for (const id of openSet) {
            if (current === null || fScore[id] < fScore[current]) {
                current = id;
            }
        }
        if (current == goalId) {
            return reconstructPath(cameFrom, current);
        }
        openSet.delete(current);
        for (const neighbourId in tree[current].neighbours) {
            const cost = tree[current].neighbours[neighbourId];
            const tentativeG = gScore[current] + cost;
            if (tentativeG < gScore[neighbourId]) {
                cameFrom[neighbourId] = current;
                gScore[neighbourId] = tentativeG;
                fScore[neighbourId] = tentativeG + heuristic(tree[neighbourId], tree[goalId]);
                openSet.add(neighbourId)
            }
        }
    }
    return null;
}

function heuristic(a, b) {
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y
    return sqrt(pow(dx, 2) + pow(dy, 2))
}

function loadHex(text) {
    const hexes = text.trim().split("\n");
    let finalTree = {};    
    const directions = [
        { q:  1, r: -1, s:  0 },
        { q:  1, r:  0, s: -1 },
        { q:  0, r:  1, s: -1 },
        { q: -1, r:  1, s:  0 },
        { q: -1, r:  0, s:  1 },
        { q:  0, r: -1, s:  1 }
    ];
    hexes.forEach((line, index) => {
        const [q, r, s, tile_name, tile_size] = line.split(",");
        finalTree[index] = {
            coordinate: {
                q: Number(q),
                r: Number(r),
                s: Number(s)
            },
            neighbours: {},
            position: cubeToPixel(
                Number(q),
                Number(r),
                Number(s)
            ),
            entities: new Set()
        };
    });
     for (const id in finalTree) {
        const hex = finalTree[id];

        directions.forEach(direction => {
            const neighbourQ = hex.coordinate.q + direction.q;
            const neighbourR = hex.coordinate.r + direction.r;
            const neighbourS = hex.coordinate.s + direction.s;

            for (const neighbourId in finalTree) {
                const neighbour = finalTree[neighbourId];

                if (neighbour.coordinate.q === neighbourQ &&
                    neighbour.coordinate.r === neighbourR &&
                    neighbour.coordinate.s === neighbourS) {
                    hex.neighbours[neighbourId] = 1;
                    break;
                }
            }
        });
    }

    return finalTree
}

function cubeToPixel(q, r, s, size) {
    return {
        x: size * sqrt(3) * (q + s / 2),
        y: size * 3 / 2 * s
    };
}

function loadGrid(text) {

}

function generateGrid(gridWidth, gridHeight, tileSize) {
    let finalTree = {}
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const id = y * gridHeight + x;
            finalTree[id] = {
                coordinate: {
                    x: x, 
                    y: y
                },
                neighbours: {},
                position: {
                    x: x * tileSize,
                    y: y * tileSize
                },
                entities: {
                }
            };
            if (x > 0) {
                finalTree[id].neighbours[id - 1] = tileSize;
            }
            if (x < gridWidth - 1) {
                finalTree[id].neighbours[id + 1] = tileSize;
            }
            if (y > 0) {
                finalTree[id].neighbours[id - gridHeight] = tileSize;
            }
            if (y < gridHeight - 1) {
                finalTree[id].neighbours[id + gridHeight] = tileSize;
            }
        }
    }
    return finalTree
}

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

function processFrame() {
    const current = performance.now();
    const dt = (current - lastFrame) / 1000;

    lastFrame = current;

    context.beginFrame();
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (scenes.length > 0) {
        for (const scene of scenes) {
            scene.process(dt);
            scene.update(context, dt);
        }
    }

    context.flush();
    PRESSED = {};
    requestAnimationFrame(processFrame);
}

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

processFrame()