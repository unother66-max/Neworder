"use client";

import React, { useEffect, useRef } from "react";

type GL = WebGLRenderingContext | WebGL2RenderingContext;

function compileShader(gl: GL, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram(gl: GL, vsSource: string, fsSource: string) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || "Unknown program error";
    gl.deleteProgram(program);
    throw new Error(info);
  }
  return program;
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// 2D simplex noise + fbm + UV domain warp distortion
const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
varying vec2 v_uv;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float f = 0.0;
  float a = 0.55;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    f += a * snoise(p);
    p = rot * p * 1.85;
    a *= 0.55;
  }
  return f;
}

void main() {
  // Keep aspect stable so distortion feels "fluid" not stretched.
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5);
  p.x *= u_res.x / max(1.0, u_res.y);

  float t = u_time;

  // Domain warp (two fbm fields)
  float n1 = fbm(p * 1.15 + vec2(0.0, t * 0.08));
  float n2 = fbm(p * 1.35 + vec2(t * 0.07, 0.0));
  vec2 warp = vec2(n1, n2);

  // Main UV distortion. Tuned to feel like liquid "breathing".
  float amp = 0.040;
  vec2 duv = warp * amp;
  duv += vec2(
    snoise(p * 2.0 + vec2(t * 0.12, -t * 0.09)),
    snoise(p * 2.0 + vec2(-t * 0.10, t * 0.11))
  ) * 0.010;

  vec2 uv2 = uv + duv;

  // Slight chroma separation for vivid "paint mixing"
  vec2 off = duv * 0.75;
  vec4 c0 = texture2D(u_tex, uv2);
  vec4 cr = texture2D(u_tex, uv2 + off * 0.65);
  vec4 cb = texture2D(u_tex, uv2 - off * 0.65);
  vec3 col = vec3(cr.r, c0.g, cb.b);

  // Gentle contrast boost without crushing highlights
  col = pow(col, vec3(0.92));
  col = mix(col, col * 1.08, 0.55);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function VisualBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      (canvas.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "high-performance" }) as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "high-performance" }) as WebGLRenderingContext | null);
    if (!gl) return;

    const program = createProgram(gl, VERT, FRAG);
    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, "a_pos");
    const timeLoc = gl.getUniformLocation(program, "u_time");
    const resLoc = gl.getUniformLocation(program, "u_res");
    const texLoc = gl.getUniformLocation(program, "u_tex");

    // Fullscreen quad
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // temporary 1x1 pixel until image loads
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (texLoc) gl.uniform1i(texLoc, 0);

    let texReady = false;
    const img = new Image();
    img.decoding = "async";
    img.src = "/bg-texture.png";
    img.onload = () => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      texReady = true;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      if (resLoc) gl.uniform2f(resLoc, w, h);
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    resize();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(1, 1, 1, 0);

    const t0 = performance.now();
    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      if (!texReady) {
        // still draw (white), but avoid wasting GPU too much
      }
      const t = (now - t0) * 0.001;
      if (timeLoc) gl.uniform1f(timeLoc, t);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      img.onload = null;
      gl.deleteTexture(tex);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}

