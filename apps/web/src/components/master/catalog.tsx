'use client';

import { useQuery } from '@tanstack/react-query';
import { QUESTION_TYPE_LABEL, type QuestionType } from '@folks/shared';
import { useSession } from '@/lib/session';
import { cx } from '@/components/ui';

/** Catálogo do MASTER (ADR 0013): metodologias e modelos de trilha. */
export type MethodologyStatus = 'ACTIVE' | 'INACTIVE' | 'COMING_SOON';
export interface Methodology {
  id: string; code: string; name: string; description?: string | null; answerFormats: string[]; guidance?: string | null;
  status: MethodologyStatus; isSystem: boolean; defaultTimeLimitMs?: number | null; sortOrder: number; questionCount: number; capture: boolean;
}
export type StepKind = 'VIDEO' | 'LESSON' | 'PRACTICE' | 'INTERACTIVE';
export interface TrailStep { kind: StepKind; min: number; max?: number | null }
export interface TrailStructure {
  unitSteps: TrailStep[]; closingSteps?: TrailStep[] | null; closingTitle?: string | null;
  minUnits?: number | null; maxUnits?: number | null; exam: boolean; methodologies: string[];
}
export interface TrailTemplate { id: string; code: string; name: string; description?: string | null; structure: TrailStructure; isActive: boolean; sortOrder: number; courseCount: number }

export const CAPTURE_FORMATS = ['VOICE', 'PHOTO', 'VIDEO'] as const;
export const FORMAT_LABEL: Record<string, string> = {
  ...QUESTION_TYPE_LABEL,
  VOICE: 'Voz (microfone)', PHOTO: 'Foto (câmera)', VIDEO: 'Vídeo (câmera)',
} as Record<QuestionType | (typeof CAPTURE_FORMATS)[number], string>;
export const METHODOLOGY_STATUS: Record<MethodologyStatus, { label: string; pill: string }> = {
  ACTIVE: { label: 'Ativa', pill: 'ACTIVE' }, INACTIVE: { label: 'Inativa', pill: 'DISABLED' }, COMING_SOON: { label: 'Em breve', pill: 'COMING_SOON' },
};
export const STEP: Record<StepKind, { label: string; icon: string; color: string }> = {
  VIDEO: { label: 'Vídeo', icon: '🎬', color: 'var(--color-blue)' },
  LESSON: { label: 'Aula em telas', icon: '📖', color: 'var(--color-purple, #9b7bff)' },
  PRACTICE: { label: 'Prática', icon: '🎯', color: 'var(--color-amber)' },
  INTERACTIVE: { label: 'Interativo', icon: '🧩', color: 'var(--color-green)' },
};

export const useMethodologies = () => {
  const { api } = useSession();
  return useQuery({ queryKey: ['master', 'methodologies'], queryFn: () => api.http.get<Methodology[]>('/master/methodologies') });
};
export const useTrailTemplates = () => {
  const { api } = useSession();
  return useQuery({ queryKey: ['master', 'trail-templates'], queryFn: () => api.http.get<TrailTemplate[]>('/master/trail-templates') });
};

/** "1 ou mais", "opcional", "2 a 3"... */
export function countLabel(s: TrailStep) {
  const max = s.max ?? null;
  if (s.min === 0 && max === null) return 'opcional';
  if (s.min === 0) return `até ${max}`;
  if (max === null) return s.min === 1 ? '1 ou mais' : `${s.min} ou mais`;
  if (max === s.min) return `${s.min}`;
  return `${s.min} a ${max}`;
}

function StepChip({ s }: { s: TrailStep }) {
  const st = STEP[s.kind];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold', s.min === 0 && 'border-dashed')}
      style={{ borderColor: `color-mix(in srgb, ${st.color} 45%, transparent)`, background: `color-mix(in srgb, ${st.color} 12%, transparent)` }}>
      <span aria-hidden>{st.icon}</span>{st.label}<span className="font-medium text-dim">· {countLabel(s)}</span>
    </span>
  );
}

/** Desenho do modelo: como fica uma trilha com ele (unidades de exemplo + unidade final + desafio). */
export function TemplatePreview({ s, units = 2 }: { s: TrailStructure; units?: number }) {
  const n = Math.max(s.minUnits ?? 1, Math.min(units, s.maxUnits ?? units));
  return (
    <div className="flex flex-col gap-2" aria-label="Prévia da estrutura da trilha">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 text-xs font-extrabold text-muted">Unidade {i + 1}</span>
          {s.unitSteps.map((st, k) => <StepChip key={k} s={st} />)}
        </div>
      ))}
      <div className="pl-20 text-xs text-dim">{s.maxUnits ? `até ${s.maxUnits} unidades` : 'repete em cada unidade'}{s.minUnits ? ` · mínimo ${s.minUnits}` : ''}</div>
      {s.closingSteps?.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 text-xs font-extrabold text-amber">{s.closingTitle || 'Final'}</span>
          {s.closingSteps.map((st, k) => <StepChip key={k} s={st} />)}
        </div>
      ) : null}
      {s.exam && <div className="flex items-center gap-2"><span className="w-20 shrink-0 text-xs font-extrabold text-amber">Fim</span><span className="rounded-xl bg-amber/15 px-2.5 py-1 text-xs font-bold text-amber">🏆 Desafio final</span></div>}
    </div>
  );
}
