import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SURFACE_0 = "#14161A";
const SIGNAL = "#E7A34B";
const TEXT_MUTED = "#98A0AB";
const STRIP_COUNT = 10;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          backgroundColor: SURFACE_0,
        }}
      >
        <div style={{ display: "flex", fontSize: 96, letterSpacing: 20, color: "#ECEEF1" }}>
          MAT<span style={{ color: SIGNAL }}>I</span>Z
        </div>
        <div style={{ display: "flex", fontSize: 32, color: TEXT_MUTED }}>
          Lee el color a ciegas.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {Array.from({ length: STRIP_COUNT }, (_, i) => {
            const t = i / (STRIP_COUNT - 1);
            const lightness = Math.round(40 + t * 45);
            return (
              <div
                key={i}
                style={{
                  width: 48,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: `hsl(34, 65%, ${lightness}%)`,
                }}
              />
            );
          })}
        </div>
      </div>
    ),
    { ...size },
  );
}
