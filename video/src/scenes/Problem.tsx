import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const HEADLINES = [
  {
    text: "Trump EXTENDS Ceasefire But VOWS to Continue Blockade",
    tag: "urgency + emotional amplification",
    color: "#f0907a",
  },
  {
    text: "Iran SEIZES Two Ships \u2014 Is World War III Starting?",
    tag: "fear framing + false dilemma",
    color: "#e5c77a",
  },
  {
    text: "Europe's $28 BILLION Energy Crisis: Who's Really to Blame?",
    tag: "rage bait + missing context",
    color: "#e5a84a",
  },
  {
    text: "DOJ Charges SPLC With Fraud \u2014 Share If You Knew They Were Corrupt",
    tag: "engagement bait + appeal to emotion",
    color: "#b89cf0",
  },
];

export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [60, 75], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
        opacity: fadeIn * fadeOut,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "rgba(255,255,255,0.3)",
          fontFamily: "SF Pro Text, -apple-system, sans-serif",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          marginBottom: 44,
          textAlign: "center",
        }}
      >
        Today's headlines. Look familiar?
      </div>

      {HEADLINES.map((h, i) => {
        const delay = i * 12 + 8;
        const y = spring({ frame: frame - delay, fps, from: 40, to: 0, config: { damping: 12 } });
        const op = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: "clamp" });
        const tagOp = interpolate(frame, [delay + 15, delay + 22], [0, 1], { extrapolateRight: "clamp" });

        return (
          <div
            key={i}
            style={{
              opacity: op,
              transform: `translateY(${y}px)`,
              marginBottom: 20,
              width: "100%",
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                fontFamily: "SF Pro Text, -apple-system, sans-serif",
                lineHeight: 1.3,
                padding: "14px 18px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 10,
                borderLeft: `3px solid ${h.color}`,
              }}
            >
              {h.text}
              <div
                style={{
                  opacity: tagOp,
                  fontSize: 16,
                  fontWeight: 700,
                  color: h.color,
                  marginTop: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {h.tag}
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
