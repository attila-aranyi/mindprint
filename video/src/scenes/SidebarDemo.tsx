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

export const SidebarDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({ frame, fps, from: 400, to: 0, config: { damping: 14 } });
  const panelOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [60, 75], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
        opacity: fadeOut,
      }}
    >
      {/* Mock browser bg */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          background: "linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)",
          opacity: 0.5,
        }}
      />

      {/* Sidebar panel */}
      <div
        style={{
          opacity: panelOp,
          transform: `translateX(${slideIn}px)`,
          width: 380,
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
            padding: "16px 18px",
            background: "linear-gradient(180deg, #1c2026 0%, #15181d 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "rgba(255,255,255,0.4)",
              fontFamily: "SF Pro Text, -apple-system, sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 10,
            }}
          >
            MindPrint Analysis
          </div>

          {/* Pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PILLS.map((p, i) => {
              const delay = 10 + i * 5;
              const pillOp = interpolate(frame, [delay, delay + 8], [0, 1], { extrapolateRight: "clamp" });
              const pillScale = spring({ frame: frame - delay, fps, from: 0.8, to: 1, config: { damping: 14 } });
              return (
                <div
                  key={i}
                  style={{
                    opacity: pillOp,
                    transform: `scale(${pillScale})`,
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 12,
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
          const delay = 25 + i * 6;
          const secOp = interpolate(frame, [delay, delay + 8], [0, 1], { extrapolateRight: "clamp" });
          const secY = spring({ frame: frame - delay, fps, from: 10, to: 0, config: { damping: 14 } });

          return (
            <div
              key={i}
              style={{
                opacity: secOp,
                transform: `translateY(${secY}px)`,
                padding: "12px 18px",
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
                    fontSize: 12,
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
                      fontSize: 13,
                      color: "rgba(255,255,255,0.7)",
                      fontFamily: "SF Pro Text, -apple-system, sans-serif",
                      marginTop: 2,
                    }}
                  >
                    {s.summary}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.2)",
                }}
              >
                {"\u25B8"}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
