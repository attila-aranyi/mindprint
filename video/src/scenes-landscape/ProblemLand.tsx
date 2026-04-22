import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const LEFT = [
  { text: "Trump EXTENDS Ceasefire But VOWS to Continue Blockade", tag: "urgency + amplification", color: "#f0907a" },
  { text: "Iran SEIZES Two Ships \u2014 Is World War III Starting?", tag: "fear framing", color: "#e5c77a" },
];

const RIGHT = [
  { text: "Europe's $28 BILLION Energy Crisis: Who's Really to Blame?", tag: "rage bait", color: "#e5a84a" },
  { text: "DOJ Charges SPLC With Fraud \u2014 Share If You Knew They Were Corrupt", tag: "engagement bait", color: "#b89cf0" },
];

function HeadlineCard({ h, frame, delay, fps }: { h: typeof LEFT[0]; frame: number; delay: number; fps: number }) {
  const y = spring({ frame: frame - delay, fps, from: 30, to: 0, config: { damping: 12 } });
  const op = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: "clamp" });
  const tagOp = interpolate(frame, [delay + 12, delay + 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ opacity: op, transform: `translateY(${y}px)`, marginBottom: 16 }}>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: "rgba(255,255,255,0.85)",
          fontFamily: "SF Pro Text, -apple-system, sans-serif",
          lineHeight: 1.3,
          padding: "14px 16px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 10,
          borderLeft: `3px solid ${h.color}`,
        }}
      >
        {h.text}
        <div
          style={{
            opacity: tagOp,
            fontSize: 14,
            fontWeight: 700,
            color: h.color,
            marginTop: 6,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {h.tag}
        </div>
      </div>
    </div>
  );
}

export const ProblemLand: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [60, 75], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 80px",
        opacity: fadeIn * fadeOut,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "rgba(255,255,255,0.3)",
          fontFamily: "SF Pro Text, -apple-system, sans-serif",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          marginBottom: 36,
          textAlign: "center",
          width: "100%",
        }}
      >
        Today's headlines. Look familiar?
      </div>

      <div style={{ display: "flex", gap: 24, width: "100%" }}>
        <div style={{ flex: 1 }}>
          {LEFT.map((h, i) => (
            <HeadlineCard key={i} h={h} frame={frame} delay={8 + i * 12} fps={fps} />
          ))}
        </div>
        <div style={{ flex: 1 }}>
          {RIGHT.map((h, i) => (
            <HeadlineCard key={i} h={h} frame={frame} delay={14 + i * 12} fps={fps} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
