import { AbsoluteFill, Sequence } from "remotion";
import { Hook } from "./scenes/Hook";
import { Problem } from "./scenes/Problem";
import { Reveal } from "./scenes/Reveal";
import { Features } from "./scenes/Features";
import { SidebarDemo } from "./scenes/SidebarDemo";
import { CTA } from "./scenes/CTA";

const BG = "#0a0c10";

export const MindPrintPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Scene 1: Hook — bold statement */}
      <Sequence from={0} durationInFrames={75}>
        <Hook />
      </Sequence>

      {/* Scene 2: The problem */}
      <Sequence from={75} durationInFrames={75}>
        <Problem />
      </Sequence>

      {/* Scene 3: MindPrint reveal */}
      <Sequence from={150} durationInFrames={60}>
        <Reveal />
      </Sequence>

      {/* Scene 4: Feature showcase */}
      <Sequence from={210} durationInFrames={105}>
        <Features />
      </Sequence>

      {/* Scene 5: Sidebar demo */}
      <Sequence from={315} durationInFrames={75}>
        <SidebarDemo />
      </Sequence>

      {/* Scene 6: CTA */}
      <Sequence from={390} durationInFrames={60}>
        <CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
