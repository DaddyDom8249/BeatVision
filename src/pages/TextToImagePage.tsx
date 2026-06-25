import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ProviderMode = 'local' | 'custom';

type StoredSettings = {
  mode?: ProviderMode;
  endpoint?: string;
  apiKey?: string;
  model?: string;
};

const STORAGE_KEY = 'beatvision_text_to_image_lab_settings';

function readStoredSettings(): StoredSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredSettings(settings: StoredSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage can be blocked in some browsers. The generator still works.
  }
}

function extractImageFromJson(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;

  const obj = json as Record<string, unknown>;
  const directKeys = ['image', 'image_url', 'url', 'b64_json', 'base64'];

  for (const key of directKeys) {
    const value = obj[key];
    if (typeof value !== 'string' || !value.trim()) continue;

    if (key === 'b64_json' || key === 'base64') {
      return `data:image/png;base64,${value}`;
    }

    if (value.startsWith('http') || value.startsWith('data:image')) {
      return value;
    }

    return `data:image/png;base64,${value}`;
  }

  const output = obj.output;
  if (Array.isArray(output) && typeof output[0] === 'string') {
    return output[0];
  }

  const images = obj.images;
  if (Array.isArray(images)) {
    const first = images[0];

    if (typeof first === 'string') {
      return first.startsWith('http') || first.startsWith('data:image')
        ? first
        : `data:image/png;base64,${first}`;
    }

    if (first && typeof first === 'object') {
      return extractImageFromJson(first);
    }
  }

  return null;
}

function makeLocalPreviewSvg(prompt: string, style: string, width: number, height: number) {
  const safePrompt = (prompt.trim() || 'BeatVision text-to-image preview')
    .replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char] ?? char))
    .slice(0, 180);

  const safeStyle = style
    .replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char] ?? char))
    .slice(0, 80);

  const seed = Array.from(prompt + style).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (seed * 7 + 80) % 360;
  const hueC = (seed * 13 + 180) % 360;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hueA}, 85%, 18%)"/>
      <stop offset="50%" stop-color="hsl(${hueB}, 85%, 12%)"/>
      <stop offset="100%" stop-color="hsl(${hueC}, 85%, 20%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.30)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="${width * 0.25}" cy="${height * 0.25}" r="${Math.min(width, height) * 0.25}" fill="hsl(${hueB}, 90%, 55%)" opacity="0.32" filter="url(#blur)"/>
  <circle cx="${width * 0.75}" cy="${height * 0.65}" r="${Math.min(width, height) * 0.32}" fill="hsl(${hueC}, 90%, 55%)" opacity="0.25" filter="url(#blur)"/>
  <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.84}" rx="32" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.20)" stroke-width="2"/>
  <text x="50%" y="42%" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="${Math.max(22, width * 0.038)}" font-weight="700">
    BeatVision Image Preview
  </text>
  <text x="50%" y="50%" text-anchor="middle" fill="rgba(255,255,255,0.78)" font-family="Arial, sans-serif" font-size="${Math.max(16, width * 0.022)}">
    ${safeStyle}
  </text>
  <foreignObject x="${width * 0.16}" y="${height * 0.58}" width="${width * 0.68}" height="${height * 0.24}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font-family:Arial,sans-serif;font-size:${Math.max(14, width * 0.022)}px;line-height:1.35;text-align:center;">
      ${safePrompt}
    </div>
  </foreignObject>
  <text x="50%" y="92%" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="Arial, sans-serif" font-size="${Math.max(12, width * 0.016)}">
    Local credit-safe preview · no external API call
  </text>
</svg>`.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function TextToImagePage() {
  const navigate = useNavigate();
  const stored = readStoredSettings();

  const [mode, setMode] = useState<ProviderMode>(stored.mode ?? 'local');
  const [endpoint, setEndpoint] = useState(stored.endpoint ?? '');
  const [apiKey, setApiKey] = useState(stored.apiKey ?? '');
  const [model, setModel] = useState(stored.model ?? '');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState('Dark Cinematic Surreal');
  const [size, setSize] = useState('1024x1024');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [lastProvider, setLastProvider] = useState('Local Preview');
  const [generating, setGenerating] = useState(false);

  const [width, height] = size.split('x').map((value) => Number(value));

  const handleSaveSettings = () => {
    saveStoredSettings({ mode, endpoint, apiKey, model });
    toast.success('Text-to-image settings saved locally on this device.');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Write a prompt first.');
      return;
    }

    setGenerating(true);

    try {
      saveStoredSettings({ mode, endpoint, apiKey, model });

      if (mode === 'local') {
        const preview = makeLocalPreviewSvg(prompt, style, width || 1024, height || 1024);
        setImageUrl(preview);
        setLastProvider('Credit-Safe Local Preview');
        toast.success('Local preview generated. No external AI call was made.');
        return;
      }

      if (!endpoint.trim()) {
        toast.error('Add a custom endpoint first, or switch back to Local Preview.');
        return;
      }

      const response = await fetch(endpoint.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          style,
          width,
          height,
          model: model.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Provider returned ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.startsWith('image/')) {
        const blob = await response.blob();
        setImageUrl(URL.createObjectURL(blob));
        setLastProvider('Custom Endpoint Image Response');
        toast.success('Image generated from custom endpoint.');
        return;
      }

      const json = await response.json();
      const extracted = extractImageFromJson(json);

      if (!extracted) {
        throw new Error('Provider response did not include an image URL or base64 image.');
      }

      setImageUrl(extracted);
      setLastProvider('Custom Endpoint JSON Response');
      toast.success('Image generated from custom endpoint.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Text-to-image generation failed.';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const loadExamplePrompt = () => {
    setPrompt(
      'A cinematic industrial music video still inside a salvage yard at sunset, one consistent heroic protagonist standing under a glowing drain rack halo, oil shimmer on concrete, wrecked cars stacked like cathedral walls, dust in the light, emotional, gritty, high detail, dramatic shadows'
    );
    setNegativePrompt('blurry, low detail, extra limbs, distorted face, unreadable text, watermark');
    setStyle('Apocalyptic Industrial');
    toast.success('Example prompt loaded.');
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">BeatVision Lab</p>
            <h1 className="text-3xl font-bold text-balance">Text-to-Image Generator</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Credit-safe by default. Local preview mode makes no external calls. Custom endpoint mode lets you connect a real image provider later.
            </p>
          </div>

          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>

        <div className="grid lg:grid-cols-[1fr_420px] gap-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Prompt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Image prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={8}
                  placeholder="Describe the image you want BeatVision to create..."
                />
              </div>

              <div className="space-y-2">
                <Label>Negative prompt</Label>
                <Textarea
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  rows={3}
                  placeholder="Things to avoid: blurry, distorted face, watermark..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dark Cinematic Surreal">Dark Cinematic Surreal</SelectItem>
                      <SelectItem value="Apocalyptic Industrial">Apocalyptic Industrial</SelectItem>
                      <SelectItem value="Neon Cyberpunk">Neon Cyberpunk</SelectItem>
                      <SelectItem value="Southern Gothic">Southern Gothic</SelectItem>
                      <SelectItem value="Horror Music Video">Horror Music Video</SelectItem>
                      <SelectItem value="Dreamlike Fantasy">Dreamlike Fantasy</SelectItem>
                      <SelectItem value="Gritty Street Realism">Gritty Street Realism</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Size</Label>
                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1024x1024">1024 × 1024</SelectItem>
                      <SelectItem value="1024x576">1024 × 576</SelectItem>
                      <SelectItem value="576x1024">576 × 1024</SelectItem>
                      <SelectItem value="768x768">768 × 768</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <Button type="button" variant="outline" onClick={loadExamplePrompt}>
                  Load Example Prompt
                </Button>
                <Button type="button" onClick={handleGenerate} disabled={generating}>
                  {generating ? 'Generating...' : mode === 'local' ? 'Generate Local Preview' : 'Generate Image'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={mode} onValueChange={(value) => setMode(value as ProviderMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Credit-Safe Local Preview</SelectItem>
                      <SelectItem value="custom">Custom Endpoint</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Local mode never calls an outside provider. Custom mode only runs when you add an endpoint.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Custom endpoint URL</Label>
                  <Input
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                    placeholder="https://your-image-api.example/generate"
                    disabled={mode === 'local'}
                  />
                </div>

                <div className="space-y-2">
                  <Label>API key</Label>
                  <Input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Optional bearer token"
                    type="password"
                    disabled={mode === 'local'}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="Optional model name"
                    disabled={mode === 'local'}
                  />
                </div>

                <Button type="button" variant="outline" onClick={handleSaveSettings} className="w-full">
                  Save Settings Locally
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {imageUrl ? (
                  <>
                    <div className="rounded-xl border border-border overflow-hidden bg-black">
                      <img src={imageUrl} alt="Generated result" className="w-full h-auto block" />
                    </div>
                    <p className="text-xs text-muted-foreground">Source: {lastProvider}</p>
                    <Button asChild variant="outline" className="w-full">
                      <a href={imageUrl} download="beatvision-text-to-image-result.png">
                        Download Image
                      </a>
                    </Button>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Your generated image will appear here.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
