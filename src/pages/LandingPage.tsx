import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '@/components/layouts/Navbar';
import {
  Music2, Upload, FileText, Palette, Sparkles, CheckCircle, Film,
  ArrowRight, Zap, Shield, Target
} from 'lucide-react';

const HOW_IT_WORKS = [
  { step: 1, icon: Upload, title: 'Upload your song', desc: 'Drop your audio file — any format works.' },
  { step: 2, icon: FileText, title: 'Paste your lyrics', desc: 'The words are the foundation of everything.' },
  { step: 3, icon: Palette, title: 'Choose a visual style', desc: 'Cinematic, Cyberpunk, Fantasy, and more.' },
  { step: 4, icon: Sparkles, title: 'Add optional notes', desc: 'Guide BeatVision with your creative intent.' },
  { step: 5, icon: Zap, title: 'Reveal your world', desc: 'BeatVision generates your Visual World Report.' },
  { step: 6, icon: CheckCircle, title: 'Approve or edit', desc: 'Shape the vision until it feels right.' },
  { step: 7, icon: Film, title: 'Generate the storyboard', desc: 'Scene by scene, your video takes form.' },
];

const WHY_DIFFERENT = [
  {
    icon: Target,
    title: 'Understanding First',
    desc: 'Most AI tools jump from prompt to generation. BeatVision starts with understanding. It reveals the world first, lets you approve it, and only then moves toward generation.',
  },
  {
    icon: Shield,
    title: 'Creator Control',
    desc: 'You approve every step. The world, the storyboard, the characters. Nothing moves forward without your say. Your creative vision is always in control.',
  },
  {
    icon: Sparkles,
    title: 'Beta Mission',
    desc: 'BeatVision Beta focuses on discovering, validating, and storyboarding the world inside your song. Full video generation is coming next.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-4 overflow-hidden">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-primary/8 rounded-full blur-3xl" />
          <div className="absolute top-32 right-1/4 w-80 h-80 bg-purple-500/6 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-primary font-medium tracking-wide">Beta — Now Available</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight tracking-tight text-balance">
            Every Song Has{' '}
            <span className="gradient-text">a World.</span>
            <br />
            BeatVision Reveals It.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto text-pretty leading-relaxed">
            Upload your song. Paste your lyrics. Choose your style. BeatVision reveals the world hidden inside your music — before generating anything.
          </p>

          <div className="flex flex-col md:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 font-medium text-base"
              onClick={() => navigate('/auth')}
            >
              Start Creating
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="border border-border/60 text-foreground hover:bg-accent h-12 px-8 text-base"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              View Demo
            </Button>
          </div>

          {/* Hero visual */}
          <div className="mt-16 relative max-w-3xl mx-auto">
            <div className="bg-card border border-border rounded-2xl p-6 card-glow">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-primary/60" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">BeatVision — Visual World Report</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                {[
                  { label: 'Emotional Core', value: 'Longing and quiet defiance, reaching toward light' },
                  { label: 'Main Visual World', value: 'A rain-soaked coastal city at dusk, neon reflections' },
                  { label: 'Color Palette', value: 'Midnight Navy · Burnt Amber · Silver Mist · Deep Crimson' },
                  { label: 'Creative Match', value: '94%' },
                ].map((item) => (
                  <div key={item.label} className="bg-secondary/60 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                    <p className="text-sm text-foreground font-medium text-pretty">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-4 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-balance">How It Works</h2>
            <p className="text-muted-foreground text-pretty max-w-xl mx-auto">
              Seven steps from song to cinematic world — without a single prompt to write.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
              <Card key={step} className="bg-card border-border card-glow h-full">
                <CardContent className="p-5 flex gap-4 items-start">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-primary/60">Step {step}</span>
                    </div>
                    <p className="font-semibold text-sm text-foreground mb-1">{title}</p>
                    <p className="text-xs text-muted-foreground text-pretty">{desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {/* Last step spans full width on md */}
            <Card className="bg-card border-border card-glow md:col-span-2">
              <CardContent className="p-5 flex gap-4 items-start">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <Music2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <span className="text-xs font-mono text-primary/60">Result</span>
                  <p className="font-semibold text-sm text-foreground mb-1">Your world is ready</p>
                  <p className="text-xs text-muted-foreground">A complete visual blueprint — characters, environments, scenes — all from your song.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Different */}
      <section className="py-24 px-4 border-t border-border bg-card/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-balance">Why BeatVision Is Different</h2>
            <p className="text-muted-foreground text-pretty max-w-xl mx-auto">
              Not another AI generator. An AI Music Director that understands before it creates.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WHY_DIFFERENT.map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="bg-card border-border card-glow h-full">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center mb-4 flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2 text-balance">{title}</h3>
                  <p className="text-sm text-muted-foreground text-pretty flex-1">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-balance">
            Your song has a world waiting inside it.
          </h2>
          <p className="text-muted-foreground mb-8 text-pretty">
            Let BeatVision find it. No prompts. No AI knowledge required. Just your music.
          </p>
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-10 font-medium text-base"
            onClick={() => navigate('/auth')}
          >
            Start Creating Free
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
              <Music2 className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">BeatVision</span>
            <span className="text-xs text-muted-foreground ml-1">Beta</span>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            © 2026 BeatVision. Every Song Has a World. BeatVision Reveals It.
          </p>
        </div>
      </footer>
    </div>
  );
}
