import { Composition } from "remotion";
import { MindPrintPromo } from "./Composition";

export const Root: React.FC = () => {
  return (
    <Composition
      id="MindPrintPromo"
      component={MindPrintPromo}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
