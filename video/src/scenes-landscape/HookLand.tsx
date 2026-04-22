import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const HookLand: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = spring({ frame, fps, from: 40, to: 0, config: { damping: 12 } });
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const lineScale = spring({ frame: frame - 20, fps, from: 0, to: 1, config: { damping: 14 } });
  const subtitleOpacity = interpolate(frame, [30, 45], [0, 1], { extrapolateRight: "clamp" });
  const subtitleY = spring({ frame: frame - 30, fps, from: 20, to: 0, config: { damping: 12 } });
  const fadeOut = interpolate(frame, [60, 75], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,143,212,0.1) 0%, transparent 70%)",
        }}
      />

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            fontSize: 88,
            fontWeight: 900,
            color: "#ffffff",
            fontFamily: "SF Pro Display, -apple-system, sans-serif",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
          }}
        >
          Every headline is <span style={{ color: "#f0907a" }}>engineered</span>
        </div>

        <div
          style={{
            width: 140,
            height: 3,
            background: "linear-gradient(90deg, #4a8fd4, #9a6ad4)",
            borderRadius: 2,
            marginTop: 28,
            marginLeft: "auto",
            marginRight: "auto",
            transform: `scaleX(${lineScale})`,
            transformOrigin: "center",
          }}
        />

        <div
          style={{
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            marginTop: 24,
            fontSize: 40,
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
          }}
        >
          Now you can see how.
        </div>
      </div>
    </AbsoluteFill>
  );
};
