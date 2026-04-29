"use client";

import { useEffect, useRef } from "react";

// TypeScript에서 window 객체에 WE가 있다고 인식하게 함
declare global {
  interface Window {
    WE: any;
  }
}

export default function AutoSpinGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scriptId = "webgl-earth-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initEarth = () => {
      if (!window.WE || !containerRef.current) return;

      // 기존 맵 초기화 (React Strict Mode 중복 렌더링 방지)
      containerRef.current.innerHTML = "";

      // 1. WebGL Earth 인스턴스 생성
      const earth = new window.WE.map(containerRef.current, {
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

      // 3. 자전 애니메이션 구현
      let before: number | null = null;
      const animate = (now: number) => {
        const c = earth.getPosition();
        const elapsed = before ? now - before : 0;
        before = now;
        // 중심 경도(Longitude)를 조금씩 이동시켜 회전
        earth.setCenter([c[0], c[1] + 0.1 * (elapsed / 30)]);
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    };

    // 스크립트가 없으면 동적으로 로드
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      // WebGL Earth 공식 API 로드
      script.src = "https://webglearth.github.io/webglearth2-offline/v2/api.js";
      script.async = true;
      script.onload = initEarth;
      document.body.appendChild(script);
    } else {
      initEarth();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full pointer-events-none"
    />
  );
}
