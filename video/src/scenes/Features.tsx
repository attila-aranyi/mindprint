import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const FEATURES = [
  { label: "Tone Detection", desc: "Identifies rhetorical framing", color: "#4a8fd4" },
  { label: "Fact Check", desc: "Rates claim confidence", color: "#e5c77a" },
  { label: "Logical Fallacies", desc: "Spots reasoning errors", color: "#f0907a" },
  { label: "Engagement Tactics", desc: "Detects rage bait & clickbait", color: "#e5a84a" },
  { label: "Missing Context", desc: "Flags what's not being said", color: "#b89cf0" },
  { label: "TRIBE v2 Neural", desc: "Brain-region emotion mapping", color: "#6ebb82" },
];

export const Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [90, 105], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          opacity: titleOp,
          fontSize: 42,
          fontWeight: 800,
          color: "#ffffff",
          fontFamily: "SF Pro Display, -apple-system, sans-serif",
          textAlign: "center",
          marginBottom: 48,
          letterSpacing: "-0.02em",
        }}
      >
        6 analysis dimensions
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          width: "100%",
        }}
      >
        {FEATURES.map((f, i) => {
          const delay = 10 + i * 8;
          const scale = spring({ frame: frame - delay, fps, from: 0.8, to: 1, config: { damping: 12 } });
          const op = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: "clamp" });

          return (
            <div
              key={i}
              style={{
                opacity: op,
                transform: `scale(${scale})`,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 12,
                padding: "20px 16px",
                borderLeft: `3px solid ${f.color}`,
              }}
            >
              {/* Colored dot instead of emoji */}
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: f.color,
                  marginBottom: 10,
                  boxShadow: `0 0 12px ${f.color}44`,
                }}
              />
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#ffffff",
                  fontFamily: "SF Pro Text, -apple-system, sans-serif",
                  marginBottom: 4,
                }}
              >
                {f.label}
              </div>
              <div
                style={{
                  fontSize: 17,
                  color: "rgba(255,255,255,0.45)",
                  fontFamily: "SF Pro Text, -apple-system, sans-serif",
                }}
              >
                {f.desc}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
