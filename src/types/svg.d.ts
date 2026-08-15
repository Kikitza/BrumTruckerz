// Tipska deklaracija: `import Logo from "...svg"` daje React komponentu (SvgProps),
// u skladu sa react-native-svg-transformer-om (v. metro.config.js).
declare module "*.svg" {
  import type { FC } from "react";
  import type { SvgProps } from "react-native-svg";
  const content: FC<SvgProps>;
  export default content;
}
