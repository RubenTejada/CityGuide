import { ImageResponse } from "next/og";

// Branded fallback card for pages without their own photo. Pages that do have
// one set `openGraph.images` in their metadata, which overrides this file.
export const alt = "QueHacerRD.com — Planes, lugares y experiencias en RD";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "linear-gradient(135deg, #171717 0%, #175877 100%)",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, letterSpacing: -1 }}>
          <span>QuéHacer</span>
          <span style={{ color: "#2e9fd8" }}>RD</span>
          <span style={{ fontSize: 40, color: "#a3a3a3", paddingTop: 34 }}>.com</span>
        </div>
        <div style={{ marginTop: 24, fontSize: 38, color: "#d4d4d4" }}>
          Planes, lugares y experiencias en República Dominicana
        </div>
        <div style={{ marginTop: 48, height: 8, width: 220, background: "#f5b301" }} />
      </div>
    ),
    size,
  );
}
