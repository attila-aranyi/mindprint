import { AbsoluteFill } from "remotion";

const FEATURES = [
  { label: "Tone Detection", desc: "Identifies rhetorical framing and emotional manipulation", color: "#4a8fd4" },
  { label: "Fact Check", desc: "Rates factual claim confidence: high, low, unverifiable", color: "#e5c77a" },
  { label: "Logical Fallacies", desc: "Detects appeal to authority, false dilemma, and more", color: "#f0907a" },
  { label: "Engagement Tactics", desc: "Flags rage bait, urgency cues, clickbait patterns", color: "#e5a84a" },
  { label: "Missing Context", desc: "Reveals what's not being said and why it matters", color: "#b89cf0" },
  { label: "TRIBE v2 Neural", desc: "Maps content to brain regions for emotion detection", color: "#6ebb82" },
];

export const FeaturesImage: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(145deg, #0a0c10 0%, #0f1318 50%, #0a0c10 100%)",
        justifyContent: "center",
        alignItems: "center",
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

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 50 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginBottom: 12,
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
          }}
        >
          MindPrint
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.02em",
          }}
        >
          6 dimensions of content analysis
        </div>
      </div>

      {/* Feature grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
          width: "100%",
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,0.035)",
              borderRadius: 14,
              padding: "28px 24px",
              borderLeft: `3px solid ${f.color}`,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: f.color,
                marginBottom: 14,
                boxShadow: `0 0 16px ${f.color}44`,
              }}
            />
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#ffffff",
                fontFamily: "SF Pro Text, -apple-system, sans-serif",
                marginBottom: 6,
              }}
            >
              {f.label}
            </div>
            <div
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.45)",
                fontFamily: "SF Pro Text, -apple-system, sans-serif",
                lineHeight: 1.4,
              }}
            >
              {f.desc}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
