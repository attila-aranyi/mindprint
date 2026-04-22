import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const RevealLand: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, from: 0.5, to: 1, config: { damping: 10, mass: 0.8 } });
  const logoOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const nameOp = interpolate(frame, [10, 22], [0, 1], { extrapolateRight: "clamp" });
  const nameX = spring({ frame: frame - 10, fps, from: -30, to: 0, config: { damping: 12 } });
  const tagOp = interpolate(frame, [22, 34], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [48, 60], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glowSize = interpolate(frame, [0, 30, 60], [400, 600, 400]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: 48,
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: glowSize,
          height: glowSize,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,143,212,0.15) 0%, rgba(154,106,212,0.06) 50%, transparent 70%)",
        }}
      />

      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #4a8fd4, #9a6ad4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: logoOp,
          transform: `scale(${logoScale})`,
          boxShadow: "0 0 60px rgba(74,143,212,0.3)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#fff",
            fontFamily: "SF Pro Display, -apple-system, sans-serif",
          }}
        >
          M
        </div>
      </div>

      <div>
        <div
          style={{
            opacity: nameOp,
            transform: `translateX(${nameX}px)`,
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
            fontFamily: "SF Pro Display, -apple-system, sans-serif",
            letterSpacing: "-0.02em",
          }}
        >
          MindPrint
        </div>
        <div
          style={{
            opacity: tagOp,
            marginTop: 8,
            fontSize: 30,
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
