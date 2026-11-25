import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rules Ref",
    short_name: "Rules Ref",
    description: "Rules answers for amateur sport, with citations.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#14532d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
