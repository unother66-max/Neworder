"use client";

import { useEffect, useRef } from "react";

type WebGlEarthInstance = {
  getPosition: () => [number, number, number?];
  setCenter: (position: [number, number]) => void;
  pauseRendering?: () => void;
  resumeRendering?: () => void;
};

type WebGlEarthApi = {
  map: new (container: HTMLElement, options: Record<string, unknown>) => WebGlEarthInstance;
  tileLayer: (
    url: string,
    options: Record<string, unknown>
  ) => { addTo: (earth: WebGlEarthInstance) => void };
};

declare global {
  interface Window {
    WE?: WebGlEarthApi;
  }
}

export default function AutoSpinGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scriptId = "webgl-earth-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    let earth: WebGlEarthInstance | null = null;
    let rotationFrame: number | null = null;
    let previousUpdate: number | null = null;
    let pageVisible = document.visibilityState === "visible";
    let globeVisible = true;
    let initialized = false;
    let disposed = false;
    const targetFps = window.matchMedia("(max-width: 767px)").matches ? 36 : 45;
    const minFrameInterval = 1000 / targetFps;

    const animate = (now: number) => {
      rotationFrame = null;
      if (!earth || !pageVisible || !globeVisible || disposed) return;

      if (previousUpdate === null || now - previousUpdate >= minFrameInterval) {
        const elapsed = previousUpdate === null ? 0 : now - previousUpdate;
        const position = earth.getPosition();
        earth.setCenter([position[0], position[1] + 0.1 * (elapsed / 30)]);
        previousUpdate = now;
      }
      rotationFrame = requestAnimationFrame(animate);
    };

    const syncAnimation = () => {
      if (!earth) return;
      if (pageVisible && globeVisible && !disposed) {
        earth.resumeRendering?.();
        if (rotationFrame === null) rotationFrame = requestAnimationFrame(animate);
        return;
      }

      if (rotationFrame !== null) cancelAnimationFrame(rotationFrame);
      rotationFrame = null;
      previousUpdate = null;
      earth.pauseRendering?.();
    };

    const initEarth = () => {
      if (initialized || disposed || !window.WE) return;
      initialized = true;

      // 기존 맵 초기화 (React Strict Mode 중복 렌더링 방지)
      container.innerHTML = "";

      // 1. WebGL Earth 인스턴스 생성
      earth = new window.WE.map(container, {
        center: [30, 120], // 초기 중심 (아시아 쪽)
        zoom: 2.5, // 💡 초기 줌 레벨 (크기에 맞게 조절)
        dragging: false, // 마우스 조작 차단
        scrollWheelZoom: false, // 휠 줌 차단
        sky: false, // 💡 우주 배경(별) 제거 (투명하게)
      });

      // 2. 💡 사용자가 찾은 WebGL Earth Offline 타일 연결!
      window.WE.tileLayer(
        "https://webglearth.github.io/webglearth2-offline/{z}/{x}/{y}.jpg",
        {
          tileSize: 256,
          bounds: [
            [-85, -180],
            [85, 180],
          ],
          minZoom: 0,
          maxZoom: 16,
          tms: true, // 💡 이것이 퍼즐을 똑바로 맞춰주는 핵심 키입니다!
        }
      ).addTo(earth);
      syncAnimation();
    };

    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";
      syncAnimation();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      globeVisible = entry?.isIntersecting ?? true;
      syncAnimation();
    });
    intersectionObserver.observe(container);

    // 스크립트가 없으면 동적으로 로드
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      // WebGL Earth 공식 API 로드
      script.src = "https://webglearth.github.io/webglearth2-offline/v2/api.js";
      script.async = true;
      script.addEventListener("load", initEarth);
      document.body.appendChild(script);
    } else if (window.WE) {
      initEarth();
    } else {
      script.addEventListener("load", initEarth);
    }

    return () => {
      disposed = true;
      if (rotationFrame !== null) cancelAnimationFrame(rotationFrame);
      script?.removeEventListener("load", initEarth);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      intersectionObserver.disconnect();
      earth?.pauseRendering?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full pointer-events-none"
    />
  );
}
