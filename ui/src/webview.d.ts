// Electron's <webview> tag as a JSX intrinsic. This file must stay a module (the import below
// does that) so `declare module "react"` AUGMENTS React's types; in a global .d.ts the same
// declaration would replace them wholesale.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<DroverWebviewElement> & { src?: string; partition?: string },
        DroverWebviewElement
      >;
    }
  }
}
