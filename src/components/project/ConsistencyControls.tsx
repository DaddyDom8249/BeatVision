import { Lock, User, TreePine, Palette, SlidersHorizontal } from 'lucide-react';
import { Project } from '@/types/types';

interface Props {
  project: Project;
  onChange: (key: keyof Project, value: boolean) => void;
}

const LOCKED_INFO = [
  {
    icon: User,
    color: '#10b981',
    label: 'Character consistency locked',
    desc: 'Every scene image will follow the approved character sheet — same appearance, wardrobe, and recurring visual traits.',
  },
  {
    icon: TreePine,
    color: '#3b7eff',
    label: 'Environment consistency locked',
    desc: 'World details, textures, background, and lighting rules are locked to the approved environment sheet.',
  },
  {
    icon: Palette,
    color: '#8b5cf6',
    label: 'Style consistency locked',
    desc: 'Color palette, camera rules, and cinematic style are locked to the approved style bible.',
  },
];

interface Toggle {
  key: keyof Project;
  label: string;
  desc: string;
  color: string;
}

const TOGGLES: Toggle[] = [
  {
    key: 'image_consistency_character',
    label: 'Prioritize Character Consistency',
    desc: 'Make character appearance and wardrobe the top priority when generating each image.',
    color: '#10b981',
  },
  {
    key: 'image_consistency_environment',
    label: 'Prioritize Environment Accuracy',
    desc: 'Make world details, lighting, and atmosphere the top priority.',
    color: '#3b7eff',
  },
  {
    key: 'image_consistency_style',
    label: 'Prioritize Cinematic Style',
    desc: 'Make color grading, camera direction, and overall visual style the top priority.',
    color: '#8b5cf6',
  },
  {
    key: 'image_consistency_storyboard',
    label: 'Keep Scene Close to Storyboard',
    desc: 'Generate images that closely match the approved storyboard composition and scene description.',
    color: '#f59e0b',
  },
  {
    key: 'image_allow_variation',
    label: 'Allow Slight Creative Variation',
    desc: 'Give BeatVision room to make small creative choices in framing and composition while staying in your world.',
    color: '#a78bfa',
  },
];

export default function ConsistencyControls({ project, onChange }: Props) {
  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-[#8b5cf6]" />
        <h3 className="font-mono text-sm font-semibold tracking-widest text-[#8b5cf6] uppercase">
          Consistency Controls
        </h3>
      </div>

      <p className="text-xs text-[#666] leading-relaxed">
        Your approved creative direction is locked into every scene image. Use these controls to tell BeatVision what matters most to you.
      </p>

      {/* Locked indicators */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] text-[#444] uppercase tracking-widest">Locked to Approved Assets</p>
        {LOCKED_INFO.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-start gap-3 bg-[#0d0d0d] border border-[#1a1a1a] rounded p-3">
              <Lock className="w-3 h-3 mt-0.5 shrink-0" style={{ color: item.color }} />
              <Icon className="w-3 h-3 mt-0.5 shrink-0" style={{ color: item.color }} />
              <div>
                <p className="font-mono text-[11px] font-semibold" style={{ color: item.color }}>{item.label}</p>
                <p className="text-[10px] text-[#555] leading-relaxed mt-0.5">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] text-[#444] uppercase tracking-widest">Your Priorities</p>
        {TOGGLES.map(toggle => {
          const isOn = !!project[toggle.key];
          return (
            <button
              key={toggle.key}
              onClick={() => onChange(toggle.key, !isOn)}
              className={`w-full text-left flex items-start gap-3 rounded p-3 border transition-all ${
                isOn
                  ? 'bg-[#111] border-opacity-50'
                  : 'bg-[#0d0d0d] border-[#1a1a1a] opacity-60 hover:opacity-80'
              }`}
              style={isOn ? { borderColor: toggle.color + '50' } : {}}
            >
              {/* Toggle pill */}
              <div
                className={`mt-0.5 shrink-0 w-8 h-4 rounded-full border transition-all flex items-center ${
                  isOn ? 'justify-end' : 'justify-start'
                }`}
                style={isOn ? { background: toggle.color + '33', borderColor: toggle.color + '66' } : { background: '#1a1a1a', borderColor: '#333' }}
              >
                <div
                  className="w-3 h-3 rounded-full mx-0.5 transition-all"
                  style={{ background: isOn ? toggle.color : '#444' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="font-mono text-xs font-semibold transition-colors"
                  style={{ color: isOn ? toggle.color : '#777' }}
                >
                  {toggle.label}
                </p>
                <p className="text-[10px] text-[#555] leading-relaxed mt-0.5">{toggle.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
