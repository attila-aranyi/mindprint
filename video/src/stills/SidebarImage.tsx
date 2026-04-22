import { AbsoluteFill } from "remotion";

const PILLS = [
  { text: "Urgent, accusatory framing", bg: "#1e3a5c", color: "#7db4f0" },
  { text: "5 claims", bg: "#3d3118", color: "#e5c77a" },
  { text: "2 fallacies", bg: "#4a1a1a", color: "#f0907a" },
  { text: "3 tactics", bg: "#3d2e18", color: "#e5a84a" },
  { text: "4 context gaps", bg: "#2e1e4a", color: "#b89cf0" },
];

const SECTIONS = [
  { label: "TONE", color: "#4a8fd4", summary: "Grave, accusatory framing with advocacy language" },
  { label: "FACT CHECK", color: "#e5c77a", summary: "5 claims identified, 2 low confidence, 1 unverifiable" },
  { label: "LOGICAL FALLACIES", color: "#f0907a", summary: "Appeal to authority, hasty generalization" },
  { label: "ENGAGEMENT TACTICS", color: "#e5a84a", summary: "Graphic shock content, moral outrage framing" },
  { label: "MISSING CONTEXT", color: "#b89cf0", summary: "No sources cited, selective framing" },
  { label: "SUMMARY", color: "rgba(255,255,255,0.2)", summary: "" },
];

export const SidebarImage: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(145deg, #0a0c10 0%, #0f1318 50%, #0a0c10 100%)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 80,
        padding: "60px 100px",
        fontFamily: "SF Pro Display, -apple-system, sans-serif",
      }}
    >
      {/* Grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Left side */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginBottom: 16,
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
          }}
        >
          MindPrint in action
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            marginBottom: 20,
          }}
        >
          One click reveals
          <br />
          <span style={{ color: "#7db4f0" }}>what they don't
          <br />want you to see</span>
        </div>
        <div
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.4)",
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
            lineHeight: 1.5,
          }}
        >
          Tone, facts, fallacies, engagement tactics, missing context
          — analyzed in seconds on any article or social post.
        </div>
      </div>

      {/* Right: sidebar mockup */}
      <div
        style={{
          width: 380,
          flexShrink: 0,
          background: "#131619",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)",
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
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 10,
              fontFamily: "SF Pro Text, -apple-system, sans-serif",
            }}
          >
            MindPrint Analysis
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {PILLS.map((p, i) => (
              <div
                key={i}
                style={{
                  padding: "3px 9px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: p.bg,
                  color: p.color,
                  fontFamily: "SF Pro Text, -apple-system, sans-serif",
                }}
              >
                {p.text}
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              fontFamily: "SF Pro Text, -apple-system, sans-serif",
            }}
          >
            @ajplus · verified · 618 likes · 2 comments
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((s, i) => (
          <div
            key={i}
            style={{
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
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: "SF Pro Text, -apple-system, sans-serif",
                }}
              >
                {s.label}
              </div>
              {s.summary && (
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.65)",
                    marginTop: 1,
                    fontFamily: "SF Pro Text, -apple-system, sans-serif",
                  }}
                >
                  {s.summary}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{"\u25B8"}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
