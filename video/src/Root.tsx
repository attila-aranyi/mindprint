import { Composition, Still } from "remotion";
import { MindPrintPromo } from "./Composition";
import { MindPrintLandscape } from "./CompositionLandscape";
import { HeroImage } from "./stills/HeroImage";
import { FeaturesImage } from "./stills/FeaturesImage";
import { SidebarImage } from "./stills/SidebarImage";

export const Root: React.FC = () => {
  return (
    <>
      {/* Videos */}
      <Composition
        id="MindPrintPromo"
        component={MindPrintPromo}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="MindPrintLinkedIn"
        component={MindPrintLandscape}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Stills — LinkedIn 1200x627 recommended */}
      <Still id="HeroImage" component={HeroImage} width={2400} height={1254} />
      <Still id="FeaturesImage" component={FeaturesImage} width={2400} height={1254} />
      <Still id="SidebarImage" component={SidebarImage} width={2400} height={1254} />
    </>
  );
};
