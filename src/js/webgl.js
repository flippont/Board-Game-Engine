
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

export { WebGLRenderer}