import { useState } from 'react';
import { supabase } from '@/db/supabase';
import type { Project } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageSquare, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  project: Project;
  userId: string;
}

type YesNo = true | false | null;

export default function BetaFeedbackSection({ project, userId }: Props) {
  const [understandingScore, setUnderstandingScore] = useState<number>(0);
  const [worldAccuracyScore, setWorldAccuracyScore] = useState<number>(0);
  const [gaveNewIdeas, setGaveNewIdeas] = useState<YesNo>(null);
  const [trustToGenerate, setTrustToGenerate] = useState<YesNo>(null);
  const [whatFeltRight, setWhatFeltRight] = useState('');
  const [whatFeltWrong, setWhatFeltWrong] = useState('');
  const [whatWouldChange, setWhatWouldChange] = useState('');
  const [wouldUseAgain, setWouldUseAgain] = useState<YesNo>(null);
  const [wouldRecommend, setWouldRecommend] = useState<YesNo>(null);
  const [finalNotes, setFinalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('beta_feedback').insert({
        project_id: project.id,
        user_id: userId,
        understanding_score: understandingScore || null,
        world_accuracy_score: worldAccuracyScore || null,
        gave_new_ideas: gaveNewIdeas,
        trust_to_generate_video: trustToGenerate,
        what_felt_right: whatFeltRight.trim() || null,
        what_felt_wrong_or_missing: whatFeltWrong.trim() || null,
        what_would_change: whatWouldChange.trim() || null,
        would_use_again: wouldUseAgain,
        would_recommend: wouldRecommend,
        final_notes: finalNotes.trim() || null,
      });
      if (error) throw error;
      setSubmitted(true);
      toast.success('Feedback saved. This helps improve BeatVision.');
    } catch {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const RatingInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex gap-1.5 flex-wrap">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-9 h-9 rounded-lg text-sm font-medium transition-all border ${
            value === n
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-secondary text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );

  const YesNoInput = ({ value, onChange }: { value: YesNo; onChange: (v: boolean) => void }) => (
    <div className="flex gap-2">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`px-5 h-9 rounded-lg text-sm font-medium transition-all border ${
            value === v
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-secondary text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
          }`}
        >
          {v ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );

  if (submitted) {
    return (
      <Card className="bg-card border-green-500/30">
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-2">Feedback saved.</h3>
          <p className="text-sm text-muted-foreground">This helps improve BeatVision. Thank you for helping us build the future of music video creation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent border border-border flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-bold text-lg text-foreground">Beta Feedback</h2>
          <p className="text-xs text-muted-foreground">Did BeatVision Understand Your Song?</p>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-5 space-y-7">
          {/* Q1 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">How well did BeatVision understand your song?</p>
            <RatingInput value={understandingScore} onChange={setUnderstandingScore} />
            <p className="text-xs text-muted-foreground">1 = Not at all · 10 = Perfectly</p>
          </div>

          {/* Q2 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">How close was this revealed world to what you imagined?</p>
            <RatingInput value={worldAccuracyScore} onChange={setWorldAccuracyScore} />
            <p className="text-xs text-muted-foreground">1 = Very far · 10 = Exactly right</p>
          </div>

          {/* Q3 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Did BeatVision give you ideas you had not considered?</p>
            <YesNoInput value={gaveNewIdeas} onChange={setGaveNewIdeas} />
          </div>

          {/* Q4 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Would you trust BeatVision to generate a video from this world?</p>
            <YesNoInput value={trustToGenerate} onChange={setTrustToGenerate} />
          </div>

          {/* Q5 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">What felt right about the world?</p>
            <Textarea
              value={whatFeltRight}
              onChange={(e) => setWhatFeltRight(e.target.value)}
              placeholder="Share what resonated..."
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/40 text-sm min-h-20 resize-y"
            />
          </div>

          {/* Q6 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">What felt wrong or missing?</p>
            <Textarea
              value={whatFeltWrong}
              onChange={(e) => setWhatFeltWrong(e.target.value)}
              placeholder="What didn't land right..."
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/40 text-sm min-h-20 resize-y"
            />
          </div>

          {/* Q7 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">What would you change before generation?</p>
            <Textarea
              value={whatWouldChange}
              onChange={(e) => setWhatWouldChange(e.target.value)}
              placeholder="What needs adjusting..."
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/40 text-sm min-h-20 resize-y"
            />
          </div>

          {/* Q8 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Would you use BeatVision again?</p>
            <YesNoInput value={wouldUseAgain} onChange={setWouldUseAgain} />
          </div>

          {/* Q9 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Would you recommend BeatVision to another musician or creator?</p>
            <YesNoInput value={wouldRecommend} onChange={setWouldRecommend} />
          </div>

          {/* Q10 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Any final notes?</p>
            <Textarea
              value={finalNotes}
              onChange={(e) => setFinalNotes(e.target.value)}
              placeholder="Anything else you want BeatVision to know..."
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/40 text-sm min-h-20 resize-y"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
            ) : (
              <><Send className="w-4 h-4 mr-2" /> Submit Feedback</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
