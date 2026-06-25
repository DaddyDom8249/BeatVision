import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { VISUAL_STYLES } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '@/components/layouts/Navbar';
import { Upload, Music2, Sparkles, FileText, X, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateProjectPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [style, setStyle] = useState('Cinematic');

  const [notes, setNotes] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const demoLyrics = `[Verse 1]
I clock in where the engines sleep
Steel bones stacked in crooked rows
Sun cuts hard through the dust and grease
But I keep walking where the wreckage glows

[Pre-Chorus]
There is a halo over broken things
A spark inside the oil and rain
I turn the damage into wings
And drag a little light from pain

[Chorus]
Drain rack halo, shine on me
Make something holy out of machinery
I am not finished, I am not gone
I build a world from what went wrong

[Verse 2]
Every scar has a rhythm underneath
Every ghost has a place to stand
I hear thunder in the battery teeth
And hold tomorrow in my hands

[Final Chorus]
Drain rack halo, burn through the dark
One last ember, one last spark
If I fade down to a single flame
Let the world remember my name`;

  const demoNotes =
    'Demo concept: gritty industrial music video, emotional but powerful, one consistent protagonist, LKQ-style salvage yard, drain rack halo symbolism, dust, steel, oil shine, sunlight through wrecked cars, ending with one surviving spark.';

  const loadDemoProject = (event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const demoTitle = 'Drain Rack Halo';
    const demoArtist = 'BeatVision Demo';

    setTitle(demoTitle);
    setArtist(demoArtist);
    setLyrics(demoLyrics);
    setStyle('Cinematic');
    setNotes(demoNotes);
    setDemoLoaded(true);

    // Backup force-fill for any input that is not behaving as a controlled React field.
    window.setTimeout(() => {
      const forceValue = (selector: string, value: string) => {
        const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el) return;
        const setter =
          el instanceof HTMLTextAreaElement
            ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
            : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

        setter?.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      forceValue('#title', demoTitle);
      forceValue('input[name="title"]', demoTitle);
      forceValue('#artist', demoArtist);
      forceValue('input[name="artist"]', demoArtist);
      forceValue('#lyrics', demoLyrics);
      forceValue('textarea[name="lyrics"]', demoLyrics);
      forceValue('#notes', demoNotes);
      forceValue('textarea[name="notes"]', demoNotes);

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);

    toast.success('Demo loaded. If fields do not visibly fill, refresh this preview once.');
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  const createDemoProjectNow = (event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    setTitle('Drain Rack Halo');
    setArtist('BeatVision Demo');
    setLyrics(demoLyrics);
    setStyle('Cinematic');
    setNotes(demoNotes);

    toast.success('Demo loaded. Creating project now...');

    window.setTimeout(() => {
      const form = document.querySelector('form') as HTMLFormElement | null;
      form?.requestSubmit();
    }, 900);
  };


  useEffect(() => {
    const handleDemoButtonClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const button = target?.closest('button');
      const label = button?.textContent?.trim().toLowerCase() || '';

      const isDemoButton =
        label === 'load demo project' ||
        label === 'create demo project' ||
        label === 'fill demo form';

      if (!isDemoButton) return;

      loadDemoProject(event);
    };

    document.addEventListener('click', handleDemoButtonClick, true);
    return () => document.removeEventListener('click', handleDemoButtonClick, true);
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;

    const shouldLoadDemo = window.localStorage.getItem('beatvision_demo_autoload') === '1';
    if (!shouldLoadDemo) return;

    window.localStorage.removeItem('beatvision_demo_autoload');

    window.setTimeout(() => {
      loadDemoProject();
    }, 0);
  }, [authLoading, user]);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
    } else {
      toast.error('Please upload a valid audio file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        toast.error('Please upload a valid audio file.');
        return;
      }
      setAudioFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Please enter a project title.'); return; }
    if (!lyrics.trim()) { toast.error('Please paste your lyrics.'); return; }
    if (!user) { navigate('/auth'); return; }

    setSubmitting(true);
    try {
      let songFileUrl: string | null = null;
      let songFileName: string | null = null;

      // Upload audio to Supabase Storage
      if (audioFile) {
        const ext = audioFile.name.split('.').pop() || 'mp3';
        const filePath = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('songs')
          .upload(filePath, audioFile, { contentType: audioFile.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('songs').getPublicUrl(filePath);
        songFileUrl = urlData.publicUrl;
        songFileName = audioFile.name;
      }

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          owner_id: user.id,
          title: title.trim(),
          song_file: songFileUrl,
          song_file_name: songFileName,
          lyrics: lyrics.trim(),
          selected_style: style,
          optional_notes: notes.trim() || null,
          status: 'Draft',
        })
        .select()
        .maybeSingle();

      if (projectError || !project) throw projectError || new Error('Failed to create project');

      toast.success('Project created! Revealing your world...');
      navigate(`/project/${project.id}?generate=true`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create project';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="pt-20 pb-16 px-4 max-w-2xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-balance">
            Create New Project
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            Upload your song, paste your lyrics, and let BeatVision reveal the world inside your music.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Quick Demo</p>
                <p className="text-xs text-muted-foreground">
                  Create a complete demo project instantly using BeatVision&apos;s safe local fallback workflow.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  onClick={(e) => createDemoProjectNow(e)}
                  disabled={submitting}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >Create Demo Project</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={(e) => loadDemoProject(e)}
                  className="border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
                >Fill Demo Form</Button>
              </div>
            </CardContent>
          </Card>

          {demoLoaded && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
              Demo Loaded Successfully. Title, artist, lyrics, style, and notes were filled.
            </div>
          )}

          {/* Project Title */}
          <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-2">
              <Label htmlFor="title" className="text-sm font-normal text-muted-foreground flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" />
                Project Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your project a name..."
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 h-10"
                maxLength={100}
              />
            </CardContent>
          </Card>

          {/* Song Upload */}
          <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-3">
              <Label className="text-sm font-normal text-muted-foreground flex items-center gap-2">
                <Music2 className="w-3.5 h-3.5" />
                Song Upload <span className="text-muted-foreground/50 font-normal ml-1">(optional)</span>
              </Label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                {audioFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                      <Music2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{audioFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAudioFile(null); }}
                      className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-foreground mb-1">Drop your song here or click to browse</p>
                    <p className="text-xs text-muted-foreground">MP3, WAV, FLAC, AAC, OGG supported</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
              </div>
            </CardContent>
          </Card>

          {/* Lyrics */}
          <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-2">
              <Label htmlFor="lyrics" className="text-sm font-normal text-muted-foreground flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" />
                Lyrics <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="lyrics"
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Paste your full lyrics here. The more complete, the richer the world BeatVision will reveal..."
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 min-h-40 resize-y"
              />
            </CardContent>
          </Card>

          {/* Visual Style */}
          <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-2">
              <Label className="text-sm font-normal text-muted-foreground flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                Visual Style <span className="text-destructive">*</span>
              </Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="bg-secondary border-border text-foreground h-10">
                  <SelectValue placeholder="Choose a visual style" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {VISUAL_STYLES.map((s) => (
                    <SelectItem key={s} value={s} className="text-foreground hover:bg-accent focus:bg-accent">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This guides the visual language BeatVision uses to interpret your song.
              </p>
            </CardContent>
          </Card>

          {/* Additional Notes */}
          <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-2">
              <Label htmlFor="notes" className="text-sm font-normal text-muted-foreground flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                Additional Notes{' '}
                <span className="text-muted-foreground/50 font-normal ml-1">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={`Tell BeatVision anything important about your vision, characters, story, meaning, or things to avoid.\n\nExample: This song is about my daughter. I want the ending to feel hopeful. No futuristic technology. The main character wears black.`}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/40 min-h-28 resize-y text-sm"
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Demo Mode</p>
              <p className="text-xs text-muted-foreground">
                Loads a complete sample song concept so you can test BeatVision without writing anything first.
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => loadDemoProject(e)}
              className="rounded-md border border-blue-500/30 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/10"
            >
              Load Demo Project
            </button>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating your world...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Reveal My World
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
