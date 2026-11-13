const base = (title: string, body: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 0 }
  body { margin:0; font-family: 'Plus Jakarta Sans', Arial, sans-serif; background:#0d0a1f; color:#fff }
  .cert { width: 297mm; height: 210mm; box-sizing: border-box; padding: 24mm; display:flex; flex-direction:column; justify-content:space-between;
          background: radial-gradient(circle at 20% 20%, #3b1f7a 0, #0d0a1f 60%) }
  h1 { font-size: 42px; margin: 0; letter-spacing: 2px }
  .name { font-size: 36px; color: #ffc21a; margin: 12px 0 }
  .muted { color: #b7a9e6 }
  ul { columns: 2; margin: 8px 0 0; padding-left: 18px }
  footer { display:flex; justify-content:space-between; font-size: 12px; color:#b7a9e6 }
</style></head>
<body><div class="cert">${body}
<footer><span>Emitido em {{issuedAt}}</span><span>Código de verificação: {{code}} — {{verifyUrl}}</span></footer>
</div></body></html>`;

export const DEFAULT_COURSE_TEMPLATE = base(
  'Certificado de curso',
  `<div><div class="muted">UNIVERSO FOLKS {{tenantName}}</div><h1>CERTIFICADO</h1></div>
   <div><div class="muted">Certificamos que</div><div class="name">{{studentName}}</div>
   <div>concluiu o curso <strong>{{courseTitle}}</strong> do Planeta <strong>{{planetName}}</strong>,
   com aproveitamento de <strong>{{scorePct}}%</strong> na certificação.</div></div>`,
);

export const DEFAULT_PLANET_TEMPLATE = base(
  'Certificado de planeta',
  `<div><div class="muted">UNIVERSO FOLKS {{tenantName}}</div><h1>CERTIFICADO — PLANETA {{planetName}}</h1></div>
   <div><div class="muted">Certificamos que</div><div class="name">{{studentName}}</div>
   <div>concluiu todos os cursos que compõem o Planeta <strong>{{planetName}}</strong>:</div>
   {{courseList}}</div>`,
);
