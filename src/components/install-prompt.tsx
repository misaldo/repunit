import { useEffect, useState } from "react";
import { Download, X, Share, Smartphone, MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setIos(isIos);
    if (standalone) return;

    const dismissed = Number(localStorage.getItem("repunit-install-dismissed") || 0);
    if (Date.now() - dismissed < 4 * 86400000) return;

    const timer = window.setTimeout(() => setVisible(true), 1400);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  function dismiss() {
    localStorage.setItem("repunit-install-dismissed", String(Date.now()));
    setVisible(false);
  }

  async function install() {
    if (!installEvent) {
      setShowHelp(true);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setInstallEvent(null);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-[60] mx-auto w-full max-w-lg px-3 rise md:bottom-6">
      <section className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card p-5 shadow-2xl shadow-black/50">
        <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
        <button onClick={dismiss} aria-label="Not now" className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-elevated">
          <X className="h-4 w-4" />
        </button>
        <div className="relative flex gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="pr-7">
            <p className="text-sm font-extrabold tracking-wide">TAKE REPUNIT WITH YOU</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Install REPUNIT on your home screen — faster, smoother, works like a real app.</p>
          </div>
        </div>

        {ios ? (
          <p className="relative mt-4 rounded-xl bg-elevated p-3 text-xs leading-relaxed text-muted-foreground">
            <Share className="mr-1 inline h-4 w-4 text-primary" /> Open REPUNIT in Safari, tap <strong className="text-foreground">Share</strong>, then choose <strong className="text-foreground">Add to Home Screen</strong>.
          </p>
        ) : (
          <div className="relative mt-4 flex gap-2">
            <Button className="flex-1" variant="hero" onClick={() => void install()}>
              <Download className="mr-2 h-4 w-4" /> Install
            </Button>
            <Button variant="line" onClick={dismiss}>Not now</Button>
          </div>
        )}

        {showHelp && !ios && (
          <p className="relative mt-3 rounded-xl bg-elevated p-3 text-xs leading-relaxed text-muted-foreground">
            <MonitorDown className="mr-1 inline h-4 w-4 text-primary" />
            In your browser menu, choose <strong className="text-foreground">Install app</strong> or <strong className="text-foreground">Add to Home Screen</strong>. If this option is missing, your browser may not support app installation on this device.
          </p>
        )}
        {ios && (
          <div className="relative mt-3 flex justify-end">
            <Button variant="line" size="sm" onClick={dismiss}>Got it</Button>
          </div>
        )}
      </section>
    </div>
  );
}
