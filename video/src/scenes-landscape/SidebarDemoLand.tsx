import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const SECTIONS = [
  { label: "TONE", color: "#4a8fd4", summary: "Urgent, accusatory framing" },
  { label: "FACT CHECK", color: "#e5c77a", summary: "5 claims, 2 unverifiable" },
  { label: "FALLACIES", color: "#f0907a", summary: "Appeal to authority" },
  { label: "ENGAGEMENT", color: "#e5a84a", summary: "3 tactics detected" },
  { label: "MISSING CONTEXT", color: "#b89cf0", summary: "4 context gaps" },
  { label: "SUMMARY", color: "rgba(255,255,255,0.2)", summary: "" },
];

const PILLS = [
  { text: "Urgent, accusatory", bg: "#1e3a5c", color: "#7db4f0" },
  { text: "5 claims", bg: "#3d3118", color: "#e5c77a" },
  { text: "1 fallacy", bg: "#4a1a1a", color: "#f0907a" },
  { text: "3 tactics", bg: "#3d2e18", color: "#e5a84a" },
  { text: "4 context gaps", bg: "#2e1e4a", color: "#b89cf0" },
];

export const SidebarDemoLand: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({ frame, fps, from: 500, to: 0, config: { damping: 14 } });
  const panelOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [60, 75], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Left side text
  const leftOp = interpolate(frame, [10, 25], [0, 1], { extrapolateRight: "clamp" });
  const leftY = spring({ frame: frame - 10, fps, from: 30, to: 0, config: { damping: 12 } });

  return (
    <AbsoluteFill
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 80,
        padding: "60px 100px",
        opacity: fadeOut,
      }}
    >
      {/* Left: description */}
      <div
        style={{
          flex: 1,
          opacity: leftOp,
          transform: `translateY(${leftY}px)`,
        }}
      >
        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: "#ffffff",
            fontFamily: "SF Pro Display, -apple-system, sans-serif",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            marginBottom: 20,
          }}
        >
          One click.
          <br />
          Full analysis.
        </div>
        <div
          style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.45)",
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
            lineHeight: 1.5,
          }}
        >
          Click "Analyze" on any article or social post. MindPrint reveals the manipulation tactics in seconds.
        </div>
      </div>

      {/* Right: sidebar panel */}
      <div
        style={{
          opacity: panelOp,
          transform: `translateX(${slideIn}px)`,
          width: 360,
          flexShrink: 0,
          background: "#131619",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            background: "linear-gradient(180deg, #1c2026 0%, #15181d 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "rgba(255,255,255,0.4)",
              fontFamily: "SF Pro Text, -apple-system, sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 8,
            }}
          >
            MindPrint Analysis
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {PILLS.map((p, i) => {
              const delay = 10 + i * 4;
              const pillOp = interpolate(frame, [delay, delay + 8], [0, 1], { extrapolateRight: "clamp" });
              const pillScale = spring({ frame: frame - delay, fps, from: 0.8, to: 1, config: { damping: 14 } });
              return (
                <div
                  key={i}
                  style={{
                    opacity: pillOp,
                    transform: `scale(${pillScale})`,
                    padding: "3px 9px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "SF Pro Text, -apple-system, sans-serif",
                    background: p.bg,
                    color: p.color,
                  }}
                >
                  {p.text}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((s, i) => {
          const delay = 20 + i * 5;
          const secOp = interpolate(frame, [delay, delay + 8], [0, 1], { extrapolateRight: "clamp" });
          const secY = spring({ frame: frame - delay, fps, from: 8, to: 0, config: { damping: 14 } });

          return (
            <div
              key={i}
              style={{
                opacity: secOp,
                transform: `translateY(${secY}px)`,
                padding: "10px 16px",
                borderBottom: i < SECTIONS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                borderLeft: `3px solid ${s.color}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.5)",
                    fontFamily: "SF Pro Text, -apple-system, sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {s.label}
                </div>
                {s.summary && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.65)",
                      fontFamily: "SF Pro Text, -apple-system, sans-serif",
                      marginTop: 1,
                    }}
                  >
                    {s.summary}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{"\u25B8"}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
