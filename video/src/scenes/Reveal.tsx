import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, from: 0.5, to: 1, config: { damping: 10, mass: 0.8 } });
  const logoOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const nameOp = interpolate(frame, [12, 24], [0, 1], { extrapolateRight: "clamp" });
  const nameY = spring({ frame: frame - 12, fps, from: 20, to: 0, config: { damping: 12 } });
  const tagOp = interpolate(frame, [24, 36], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [48, 60], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Pulse glow
  const glowSize = interpolate(frame, [0, 30, 60], [300, 450, 300]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeOut,
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: glowSize,
          height: glowSize,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,143,212,0.2) 0%, rgba(154,106,212,0.08) 50%, transparent 70%)",
        }}
      />

      {/* Logo circle */}
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #4a8fd4, #9a6ad4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: logoOp,
          transform: `scale(${logoScale})`,
          boxShadow: "0 0 60px rgba(74,143,212,0.3)",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: "#fff",
            fontFamily: "SF Pro Display, -apple-system, sans-serif",
          }}
        >
          M
        </div>
      </div>

      {/* Name */}
      <div
        style={{
          opacity: nameOp,
          transform: `translateY(${nameY}px)`,
          marginTop: 32,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "#ffffff",
            fontFamily: "SF Pro Display, -apple-system, sans-serif",
            letterSpacing: "-0.02em",
          }}
        >
          MindPrint
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: tagOp,
          marginTop: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: "rgba(255,255,255,0.45)",
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
          }}
        >
          See through the manipulation
        </div>
      </div>
    </AbsoluteFill>
  );
};
