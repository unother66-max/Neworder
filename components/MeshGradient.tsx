"use client";

import { useEffect, useRef } from "react";

type GL = WebGLRenderingContext;

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

function createProgram(gl: GL, vertexSource: string, fragmentSource: string) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
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

export default function MeshGradient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vertexShaderSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // 💡 핵심: 기존 유체 믹스 유지 (그레인 제거)
    const fragmentShaderSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;

      // 4가지 핵심 파스텔 색상 정의
      vec3 color1 = vec3(0.75, 0.90, 0.83); // Mint
      vec3 color2 = vec3(0.55, 0.72, 0.85); // Blue
      vec3 color3 = vec3(0.92, 0.79, 0.89); // Pink
      vec3 color4 = vec3(0.95, 0.89, 0.77); // Peach

      void main() {
        // 화면 비율에 상관없이 꽉 차도록 UV 설정 (검은 여백 방지)
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        
        // 흐르는 듯한 유체 움직임 계산
        vec2 q = vec2(0.);
        q.x = st.x + 0.5 * cos(u_time * 0.1) + st.y * 0.2;
        q.y = st.y + 0.5 * sin(u_time * 0.15) - st.x * 0.2;
        
        float n = 0.5 * (sin(q.x * 3.0 + u_time * 0.3) + cos(q.y * 3.0 - u_time * 0.2));
        
        // 날카로운 경계(step) 없이 mix로만 부드럽게 색상 혼합
        vec3 color = mix(color1, color2, smoothstep(-1.0, 1.0, sin(st.x * 3.0 + u_time * 0.2)));
        color = mix(color, color3, smoothstep(-0.5, 0.5, n));
        color = mix(color, color4, smoothstep(0.0, 1.0, cos(st.y * 2.0 + u_time * 0.1)));

        // 알파값을 1.0으로 고정하여 투명도/검은색 오류 완전 차단
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, "position");
    const timeLoc = gl.getUniformLocation(program, "u_time");
    const resLoc = gl.getUniformLocation(program, "u_resolution");

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

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(1, 1, 1, 1);

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

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const t0 = performance.now();
    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const t = (now - t0) * 0.003;
      if (timeLoc) gl.uniform1f(timeLoc, t);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      gl.deleteBuffer(vbo);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}

