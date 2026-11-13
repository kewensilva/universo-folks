import { parseVisual, type PublicQuestion } from '@folks/shared';

/** Visual da questão: imagem SVG, frase com lacuna ou diálogo (o HTML do conteúdo vira dados, nunca HTML na página). */
export function QuestionVisual({ visual }: { visual: PublicQuestion['visual'] }) {
  const v = parseVisual(visual);
  if (!v) return null;
  switch (v.kind) {
    case 'svg':
      return <div className="mt-4 overflow-hidden rounded-2xl bg-white/5 p-2 [&_svg]:mx-auto [&_svg]:max-h-56" dangerouslySetInnerHTML={{ __html: v.svg }} />;
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element -- URL externa do conteúdo
      return <img src={v.url} alt="" className="mx-auto mt-4 max-h-56 rounded-2xl" />;
    case 'gap':
      return (
        <p className="mt-4 rounded-2xl bg-bg-2 p-4 text-lg font-bold leading-relaxed">
          {v.parts.map((p, k) => ('blank' in p ? <span key={k} className="mx-1 inline-block min-w-16 border-b-2 border-amber text-center text-amber">&nbsp;</span> : <span key={k}> {p.text} </span>))}
        </p>
      );
    case 'dialog':
      return (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-bg-2 p-4">
          {v.context && <p className="text-sm italic text-muted">{v.context}</p>}
          {v.lines.map((l, k) => (
            <div key={k} className={l.who === 'me' ? 'self-end rounded-2xl rounded-br-sm bg-amber/20 px-4 py-2.5 font-bold' : 'self-start rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5 font-bold'}>{l.text}</div>
          ))}
        </div>
      );
    case 'text':
      return <p className="mt-4 rounded-2xl bg-bg-2 p-4 font-bold">{v.text}</p>;
  }
}
