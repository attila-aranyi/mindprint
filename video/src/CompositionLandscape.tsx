import { AbsoluteFill, Sequence } from "remotion";
import { HookLand } from "./scenes-landscape/HookLand";
import { ProblemLand } from "./scenes-landscape/ProblemLand";
import { RevealLand } from "./scenes-landscape/RevealLand";
import { FeaturesLand } from "./scenes-landscape/FeaturesLand";
import { SidebarDemoLand } from "./scenes-landscape/SidebarDemoLand";
import { CTALand } from "./scenes-landscape/CTALand";

const BG = "#0a0c10";

export const MindPrintLandscape: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Sequence from={0} durationInFrames={75}>
        <HookLand />
      </Sequence>
      <Sequence from={75} durationInFrames={75}>
        <ProblemLand />
      </Sequence>
      <Sequence from={150} durationInFrames={60}>
        <RevealLand />
      </Sequence>
      <Sequence from={210} durationInFrames={105}>
        <FeaturesLand />
      </Sequence>
      <Sequence from={315} durationInFrames={75}>
        <SidebarDemoLand />
      </Sequence>
      <Sequence from={390} durationInFrames={60}>
        <CTALand />
      </Sequence>
    </AbsoluteFill>
  );
};
