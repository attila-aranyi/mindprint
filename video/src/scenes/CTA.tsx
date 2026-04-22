import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 10 } });
  const logoOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const textOp = interpolate(frame, [10, 22], [0, 1], { extrapolateRight: "clamp" });
  const textY = spring({ frame: frame - 10, fps, from: 20, to: 0, config: { damping: 12 } });
  const tagOp = interpolate(frame, [22, 34], [0, 1], { extrapolateRight: "clamp" });
  const platformsOp = interpolate(frame, [34, 44], [0, 1], { extrapolateRight: "clamp" });

  // Subtle breathing glow
  const glowSize = interpolate(frame, [0, 30, 60], [350, 500, 350]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: glowSize,
          height: glowSize,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,143,212,0.15) 0%, rgba(154,106,212,0.06) 50%, transparent 70%)",
        }}
      />

      {/* Logo */}
      <div
        style={{
          opacity: logoOp,
          transform: `scale(${logoScale})`,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #4a8fd4, #9a6ad4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 50px rgba(74,143,212,0.25)",
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: "#fff",
            fontFamily: "SF Pro Display, -apple-system, sans-serif",
          }}
        >
          M
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          opacity: textOp,
          transform: `translateY(${textY}px)`,
          marginTop: 28,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 52,
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
      <div style={{ opacity: tagOp, marginTop: 16, textAlign: "center" }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 500,
            color: "rgba(255,255,255,0.6)",
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
          }}
        >
          Every headline is engineered.
          <br />
          <span style={{ color: "#7db4f0" }}>Now you can see how.</span>
        </div>
      </div>

      {/* Platform badges */}
      <div
        style={{
          opacity: platformsOp,
          marginTop: 48,
          display: "flex",
          gap: 12,
        }}
      >
        {["Chrome Extension", "X", "Instagram", "Any Site"].map((p, i) => (
          <div
            key={i}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              fontSize: 16,
              fontWeight: 600,
              color: "rgba(255,255,255,0.5)",
              fontFamily: "SF Pro Text, -apple-system, sans-serif",
            }}
          >
            {p}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
