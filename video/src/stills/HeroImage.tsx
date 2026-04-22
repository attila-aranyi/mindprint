import { AbsoluteFill } from "remotion";

export const HeroImage: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(145deg, #0a0c10 0%, #0f1318 50%, #0a0c10 100%)",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: 48,
        fontFamily: "SF Pro Display, -apple-system, sans-serif",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,143,212,0.1) 0%, rgba(154,106,212,0.04) 50%, transparent 70%)",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Subtle grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Logo */}
      <div
        style={{
          width: 130,
          height: 130,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #4a8fd4, #9a6ad4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 80px rgba(74,143,212,0.25), 0 0 160px rgba(74,143,212,0.08)",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 62, fontWeight: 900, color: "#fff" }}>M</div>
      </div>

      <div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.02em",
          }}
        >
          MindPrint
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
            fontFamily: "SF Pro Text, -apple-system, sans-serif",
            marginTop: 8,
          }}
        >
          Every headline is engineered.{" "}
          <span style={{ color: "#7db4f0", fontWeight: 500 }}>Now you can see how.</span>
        </div>

        {/* Platform tags */}
        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          {["Chrome Extension", "Works on any site", "X + Instagram"].map((p, i) => (
            <div
              key={i}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 15,
                fontWeight: 600,
                color: "rgba(255,255,255,0.4)",
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
