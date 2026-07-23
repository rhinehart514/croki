import { ImageResponse } from "next/og";

export const alt = "Croki. Vibe code your go-to-market.";
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
                <svg width="42" height="42" viewBox="0 0 256 256">
                  <rect width="256" height="256" rx="58" fill="#090b0f" />
                  <path fill="#f7f7f5" d="M88 61c12-3 25 3 40 15l29-15 23-24-3 61 14 31-14 57-49 33-49-33-15-57 18-29 1-23c0-9 1-14 5-16Z" />
                  <path fill="#f7f7f5" d="M84 59C62 53 42 68 36 89l12 41c3 10 14 13 21 4l25-58c3-8-2-14-10-17Z" />
                  <path d="M91 69 70 132" fill="none" stroke="#090b0f" strokeWidth="6" strokeLinecap="round" />
                  <path fill="#090b0f" d="M82 119c9-10 25-10 35 1-9 13-27 14-35-1Zm59 1c9-11 26-12 36-2-8 14-27 15-36 2Zm-29 31c9-7 23-7 32 0l-16 19-16-19Z" />
                  <path d="M128 168v16m0 0-13 10m13-10 13 10" fill="none" stroke="#090b0f" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="m152 151 28-4m-28 15h30m-29 11 27 5" fill="none" stroke="#090b0f" strokeWidth="6" strokeLinecap="round" />
                </svg>
              </div>
              Croki
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
