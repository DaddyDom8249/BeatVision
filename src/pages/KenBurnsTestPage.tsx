import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ImagePlus } from "lucide-react";
import KenBurnsFallbackButton from "@/components/project/KenBurnsFallbackButton";
import { Button } from "@/components/ui/button";

export default function KenBurnsTestPage() {
  const [imageUrl, setImageUrl] = useState("");
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);

  const activeImageUrl = useMemo(() => {
    return localImageUrl || imageUrl.trim() || null;
  }, [localImageUrl, imageUrl]);

  useEffect(() => {
    return () => {
      if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    };
  }, [localImageUrl]);

  const handleFilePick = (file?: File | null) => {
    if (!file) return;

    if (localImageUrl) {
      URL.revokeObjectURL(localImageUrl);
    }

    setLocalImageUrl(URL.createObjectURL(file));
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/">
            <Button type="button" variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>

          <div className="text-xs text-muted-foreground">
            BeatVision motion fallback test
          </div>
        </div>

        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h1 className="text-2xl font-bold">Ken Burns Fallback Test</h1>

          <p className="text-sm text-muted-foreground">
            Upload or paste one approved scene image. BeatVision will render a short browser-safe pan/zoom WebM clip.
          </p>
        </section>

        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Upload image</label>

            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40">
              <ImagePlus className="h-5 w-5 mr-2" />
              Pick an image from this device
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleFilePick(event.target.files?.[0])}
              />
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Or paste image URL</label>

            <input
              value={imageUrl}
              onChange={(event) => {
                setImageUrl(event.target.value);
                if (localImageUrl) {
                  URL.revokeObjectURL(localImageUrl);
                  setLocalImageUrl(null);
                }
              }}
              placeholder="https://..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {activeImageUrl && (
            <div className="rounded-lg border overflow-hidden bg-black">
              <img
                src={activeImageUrl}
                alt="Ken Burns source"
                className="w-full max-h-[360px] object-contain"
              />
            </div>
          )}

          <KenBurnsFallbackButton
            imageUrl={activeImageUrl}
            filename="beatvision_ken_burns_test.webm"
            label="Render Ken Burns Test Clip"
          />
        </section>
      </div>
    </main>
  );
}
