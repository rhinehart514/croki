import { ImageResponse } from "next/og";

export const alt = "Drover. Vibe code your go-to-market.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: 58,
          background: "#e3e0da",
          color: "#23211d",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "2px solid #c6c1b6",
            background: "#f4f2ee",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "28px 34px",
              borderBottom: "2px solid #c6c1b6",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  width: 42,
                  height: 42,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9,
                  background: "#23211d",
                  color: "#f4f2ee",
                }}
              >
                D
              </div>
              Drover
            </div>
            <span style={{ color: "#2e6e5e", fontSize: 17 }}>
              Local-first alpha
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "flex-end",
              justifyContent: "space-between",
              padding: 36,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 720,
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 82,
                  fontWeight: 700,
                  letterSpacing: "-0.065em",
                  lineHeight: 0.92,
                }}
              >
                Vibe code your go-to-market.
              </div>
              <div style={{ marginTop: 26, color: "#4e4b44", fontSize: 23 }}>
                One living field for the product, the bets, and what came back.
              </div>
            </div>
            <div
              style={{
                display: "flex",
                width: 250,
                flexDirection: "column",
                borderLeft: "3px solid #a9791a",
                paddingLeft: 24,
                color: "#4e4b44",
                fontSize: 18,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: "#a9791a", fontWeight: 700 }}>
                Needs you
              </span>
              Nothing leaves until you approve it.
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
