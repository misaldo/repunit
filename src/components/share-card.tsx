import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type ShareCardData = {
  headline: string;
  value: string;
  detail: string;
  footer: string;
};

const WIDTH = 1080;
const HEIGHT = 1920;

/** Draws a 1080x1920 story card on a canvas. Plain drawing code, no network access. */
export function drawShareCard(data: ShareCardData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#0b0b0c");
  background.addColorStop(1, "#1c0a0d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(WIDTH / 2, 820, 40, WIDTH / 2, 820, 720);
  glow.addColorStop(0, "rgba(255,48,60,0.35)");
  glow.addColorStop(1, "rgba(255,48,60,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ff303c";
  ctx.font = "800 44px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("REPUNIT", WIDTH / 2, 190);

  ctx.fillStyle = "#a1a1aa";
  ctx.font = "700 40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(data.headline.toUpperCase(), WIDTH / 2, 700);

  ctx.fillStyle = "#ffffff";
  let fontSize = 260;
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  while (ctx.measureText(data.value).width > WIDTH - 160 && fontSize > 90) {
    fontSize -= 10;
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  }
  ctx.fillText(data.value, WIDTH / 2, 960);

  ctx.fillStyle = "#e4e4e7";
  ctx.font = "600 52px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(data.detail, WIDTH / 2, 1070);

  ctx.fillStyle = "#71717a";
  ctx.font = "600 38px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(data.footer, WIDTH / 2, 1700);
  ctx.fillStyle = "#ff303c";
  ctx.font = "800 36px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("STRENGTH IS SOCIAL.", WIDTH / 2, 1770);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the image."))), "image/png");
  });
}

/**
 * Opens the native share sheet with the card as an image (plus text and link).
 * Returns false when the browser cannot share files, so callers can fall back.
 * Throws a DOMException named AbortError if the person closes the share sheet.
 */
export async function shareCardAsImage(data: ShareCardData, fileName: string, text: string, url?: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.canShare || !navigator.share) return false;
  const blob = await canvasToBlob(drawShareCard(data));
  const file = new File([blob], `${fileName}.png`, { type: "image/png" });
  if (!navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], title: "REPUNIT", text, ...(url ? { url } : {}) });
  return true;
}

/** Shares the card as an image where the browser allows it, otherwise downloads the PNG. */
export function ShareCardButton({ data, fileName = "repunit-card", label = "Share card", className }: { data: ShareCardData; fileName?: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function share() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await canvasToBlob(drawShareCard(data));
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "REPUNIT", text: `${data.headline}: ${data.value} ${data.detail}` });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Card saved", { description: "Post it to your story and tag your crew." });
    } catch (error) {
      // The user closing the share sheet is not an error.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not create the share card. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="line" className={className} disabled={busy} onClick={() => void share()}>
      <Share2 className="mr-2 h-4 w-4" />{busy ? "Creating…" : label}
    </Button>
  );
}
