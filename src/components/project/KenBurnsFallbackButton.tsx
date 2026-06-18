import { useState } from "react";
import { Download, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderKenBurnsFallback, downloadKenBurnsResult } from "@/lib/kenBurnsFallback";

type KenBurnsFallbackButtonProps = {
  imageUrl?: string | null;
  filename?: string;
  label?: string;
};

export default function KenBurnsFallbackButton({
  imageUrl,
  filename = "beatvision_ken_burns_fallback.webm",
  label = "Render Ken Burns Fallback",
}: KenBurnsFallbackButtonProps) {
  const [rendering, setRendering] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRender = async () => {
    setError(null);

    if (!imageUrl) {
      setError("No approved image found for this fallback render.");
      return;
    }

    try {
      setRendering(true);

      const result = await renderKenBurnsFallback(imageUrl, filename, {
        width: 768,
        height: 432,
        fps: 24,
        durationSeconds: 5,
        zoomStart: 1.02,
        zoomEnd: 1.16,
        panX: 0.35,
        panY: -0.18,
      });

      setDownloadUrl(result.url);
      downloadKenBurnsResult(result);
    } catch (err: any) {
      setError(err?.message || "Ken Burns fallback render failed.");
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" variant="secondary" size="sm" onClick={handleRender} disabled={rendering || !imageUrl}>
          {rendering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Film className="h-4 w-4 mr-2" />}
          {rendering ? "Rendering..." : label}
        </Button>

        {downloadUrl && (
          <a href={downloadUrl} download={filename} className="inline-flex">
            <Button type="button" variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download Again
            </Button>
          </a>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <p className="text-xs text-muted-foreground">
        Browser-safe fallback: turns one approved still image into a short pan/zoom WebM motion clip.
      </p>
    </div>
  );
}
