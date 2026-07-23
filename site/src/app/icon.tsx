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
        }}
      >
        <svg width="64" height="64" viewBox="0 0 256 256">
          <rect width="256" height="256" rx="58" fill="#090b0f" />
          <path fill="#f7f7f5" d="M88 61c12-3 25 3 40 15l29-15 23-24-3 61 14 31-14 57-49 33-49-33-15-57 18-29 1-23c0-9 1-14 5-16Z" />
          <path fill="#f7f7f5" d="M84 59C62 53 42 68 36 89l12 41c3 10 14 13 21 4l25-58c3-8-2-14-10-17Z" />
          <path d="M91 69 70 132" fill="none" stroke="#090b0f" strokeWidth="6" strokeLinecap="round" />
          <path fill="#090b0f" d="M82 119c9-10 25-10 35 1-9 13-27 14-35-1Zm59 1c9-11 26-12 36-2-8 14-27 15-36 2Zm-29 31c9-7 23-7 32 0l-16 19-16-19Z" />
          <path d="M128 168v16m0 0-13 10m13-10 13 10" fill="none" stroke="#090b0f" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m152 151 28-4m-28 15h30m-29 11 27 5" fill="none" stroke="#090b0f" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size
  );
}
