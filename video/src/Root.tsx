import { Composition } from "remotion";
import { MindPrintPromo } from "./Composition";
import { MindPrintLandscape } from "./CompositionLandscape";

export const Root: React.FC = () => {
  return (
    <>
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
    </>
  );
};
