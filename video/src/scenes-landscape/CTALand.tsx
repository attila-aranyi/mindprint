import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const CTALand: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 10 } });
  const logoOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const textOp = interpolate(frame, [8, 20], [0, 1], { extrapolateRight: "clamp" });
  const textX = spring({ frame: frame - 8, fps, from: -20, to: 0, config: { damping: 12 } });
  const tagOp = interpolate(frame, [18, 30], [0, 1], { extrapolateRight: "clamp" });
  const platformsOp = interpolate(frame, [30, 40], [0, 1], { extrapolateRight: "clamp" });
  const glowSize = interpolate(frame, [0, 30, 60], [400, 600, 400]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: 56,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: glowSize,
          height: glowSize,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,143,212,0.12) 0%, rgba(154,106,212,0.05) 50%, transparent 70%)",
        }}
      />

      <div
        style={{
          opacity: logoOp,
          transform: `scale(${logoScale})`,
          width: 110,
          height: 110,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #4a8fd4, #9a6ad4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 50px rgba(74,143,212,0.25)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 52,
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
            opacity: textOp,
            transform: `translateX(${textX}px)`,
            fontSize: 56,
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
            marginTop: 10,
            fontSize: 28,
            fontWeight: 500,
            color: "rgba(255,255,255,0.6)",
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
          }}
        >
          Every headline is engineered.{" "}
          <span style={{ color: "#7db4f0" }}>Now you can see how.</span>
        </div>

        <div
          style={{
            opacity: platformsOp,
            marginTop: 28,
            display: "flex",
            gap: 10,
          }}
        >
          {["Chrome Extension", "X", "Instagram", "Any Site"].map((p, i) => (
            <div
              key={i}
              style={{
                padding: "7px 14px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 15,
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                fontFamily: "SF Pro Text, -apple-system, sans-serif",
              }}
            >
              {p}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
