import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// The picture shown when the Zemana site is shared (WhatsApp, Instagram):
// brand yellow, the Zemana symbol and the headline. Generated at build time.
export const alt = "Zemana: sua agenda, sem bagunça.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const symbol = await readFile(
    join(process.cwd(), "public/marca/zemana-simbolo.png"),
  );
  const symbolSrc = `data:image/png;base64,${symbol.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 64,
        padding: "0 88px",
        background: "#f5c700",
        color: "#2a0081",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 340,
          height: 340,
          flexShrink: 0,
          borderRadius: 999,
          border: "8px solid #2a0081",
          background: "#ffffff",
          boxShadow: "16px 16px 0 0 #2a0081",
          transform: "rotate(-6deg)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img only */}
        <img src={symbolSrc} width={200} height={200} alt="" />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          width: 640,
        }}
      >
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "8px 24px",
            borderRadius: 999,
            border: "5px solid #2a0081",
            background: "#ffd3f0",
            fontSize: 30,
            fontWeight: 700,
            transform: "rotate(-3deg)",
          }}
        >
          ZEMANA
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 80,
            fontWeight: 700,
            lineHeight: 0.95,
            letterSpacing: -3,
          }}
        >
          <span>SUA AGENDA,</span>
          <span>SEM BAGUNÇA.</span>
        </div>
        <div style={{ display: "flex", fontSize: 30, lineHeight: 1.3 }}>
          Agenda online para profissionais de beleza e saúde
        </div>
      </div>
    </div>,
    size,
  );
}
