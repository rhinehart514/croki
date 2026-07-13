import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          background: "#23211d",
          color: "#f4f2ee",
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: "-0.08em",
        }}
      >
        D
      </div>
    ),
    size
  );
}
