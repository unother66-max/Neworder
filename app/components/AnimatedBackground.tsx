import React from "react";

const AnimatedBackground = () => {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-white pointer-events-none">
      {/* Spectrum (d-antwort 느낌의 무지개 스펙트럼) */}
      <div className="da-spectrum absolute inset-0" aria-hidden="true" />

      {/* Soft blobs (스펙트럼 위에 은은한 볼륨) */}
      <div className="absolute -top-[18%] -left-[18%] h-[760px] w-[760px] rounded-full bg-emerald-200/55 blur-[130px] mix-blend-multiply animate-blob1" />
      <div className="absolute top-[2%] -right-[14%] h-[720px] w-[720px] rounded-full bg-sky-200/55 blur-[130px] mix-blend-multiply animate-blob2" />
      <div className="absolute -bottom-[22%] left-[10%] h-[780px] w-[780px] rounded-full bg-amber-200/40 blur-[140px] mix-blend-multiply animate-blob3" />
      <div className="absolute bottom-[4%] right-[8%] h-[680px] w-[680px] rounded-full bg-fuchsia-200/40 blur-[140px] mix-blend-multiply animate-blob2 [animation-delay:3s]" />

      {/* Globe (와이어프레임 지구본) */}
      <div className="da-globe absolute right-[-10%] top-[6%] h-[520px] w-[520px] sm:right-[-6%] sm:h-[600px] sm:w-[600px] lg:right-[2%] lg:top-[8%] lg:h-[720px] lg:w-[720px]">
        <svg viewBox="0 0 1000 1000" className="h-full w-full">
          <defs>
            <radialGradient id="glow" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
              <stop offset="60%" stopColor="rgba(255,255,255,0.10)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>

          {/* Glow */}
          <circle cx="500" cy="500" r="430" fill="url(#glow)" opacity="0.45" />

          {/* Outer sphere */}
          <circle
            cx="500"
            cy="500"
            r="360"
            fill="none"
            stroke="rgba(15,23,42,0.20)"
            strokeWidth="2"
          />

          {/* Latitudes */}
          {Array.from({ length: 9 }).map((_, i) => {
            const t = (i - 4) / 5; // -0.8..0.8
            const ry = 360 * Math.cos((t * Math.PI) / 2);
            const y = 500 + 260 * t;
            return (
              <ellipse
                key={`lat-${i}`}
                cx="500"
                cy={y}
                rx="360"
                ry={Math.max(8, ry / 3.2)}
                fill="none"
                stroke="rgba(15,23,42,0.12)"
                strokeWidth="2"
                filter="url(#softBlur)"
                opacity={0.9 - Math.abs(t) * 0.35}
              />
            );
          })}

          {/* Meridians */}
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI;
            const rx = 360 * Math.cos(a);
            return (
              <ellipse
                key={`mer-${i}`}
                cx="500"
                cy="500"
                rx={Math.max(18, Math.abs(rx))}
                ry="360"
                fill="none"
                stroke="rgba(15,23,42,0.10)"
                strokeWidth="2"
                filter="url(#softBlur)"
                opacity={0.62}
              />
            );
          })}
        </svg>
      </div>

     
    </div>
  );
};

export default AnimatedBackground;

