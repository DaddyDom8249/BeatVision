import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import type { Project } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import Navbar from '@/components/layouts/Navbar';
import { Plus, FolderOpen, Trash2, Music2, Calendar, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  'Draft': 'bg-muted text-muted-foreground border-border',
  'World Approved': 'bg-primary/15 text-primary border-primary/30',
  'Storyboard Approved': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'Ready for Generation': 'bg-green-500/15 text-green-400 border-green-500/30',
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    fetchProjects();
  }, [user]);

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', user!.id)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load projects');
    } else {
      setProjects(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete project');
    } else {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast.success('Project deleted');
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="pt-20 pb-16 px-4 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground text-balance">Your Projects</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {projects.length} {projects.length === 1 ? 'world' : 'worlds'} revealed
            </p>
          </div>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 shrink-0"
            onClick={() => navigate('/create')}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Project
          </Button>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card border-border">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-5 w-2/3 bg-muted" />
                  <Skeleton className="h-4 w-1/2 bg-muted" />
                  <Skeleton className="h-4 w-1/3 bg-muted" />
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-9 w-28 bg-muted" />
                    <Skeleton className="h-9 w-24 bg-muted" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
              <Music2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2 text-balance">No projects yet</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm text-pretty">
              Your first project is where your song's world begins. Upload a track and let BeatVision reveal what's inside.
            </p>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate('/create')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project) => (
              <Card key={project.id} className="bg-card border-border card-glow h-full flex flex-col">
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-semibold text-foreground text-base leading-snug min-w-0 truncate text-balance">
                      {project.title}
                    </h3>
                    <Badge
                      className={`text-xs shrink-0 border ${STATUS_COLORS[project.status] || STATUS_COLORS['Draft']}`}
                    >
                      {project.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 mb-4 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Music2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate min-w-0">{project.song_file_name || 'No audio file'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>{project.selected_style}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>{format(new Date(project.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <Button
                      size="sm"
                      className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-9"
                      onClick={() => navigate(`/project/${project.id}`)}
                    >
                      <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                      Open Project
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border max-w-[calc(100%-2rem)] md:max-w-lg">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-foreground">Delete Project</AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground">
                            Are you sure you want to delete <strong className="text-foreground">"{project.title}"</strong>? This will permanently remove all generated content, storyboards, and feedback. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-secondary text-secondary-foreground border-border hover:bg-accent">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(project.id)}
                          >
                            Delete Project
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
