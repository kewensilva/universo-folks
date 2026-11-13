import type { Bundle } from './schema';
import { Reporter } from './report';

/**
 * Aplica os PADRÕES de negócio quando o conteúdo não informou
 * (knowledge/produto/regras-de-negocio.md):
 *  - "Para a vida": planeta FREE; unidades 1-2 FREE e as demais PREMIUM (plano grátis)
 *  - "Para o trabalho": planeta PREMIUM; cursos com certificado
 *  - planeta sem cursos e curso sem trilha: "Em breve" (COMING_SOON)
 * Tudo que é aplicado vira "info" no relatório.
 */
export function applyDefaults(b: Bundle, rep: Reporter): Bundle {
  b.planets.forEach((p, pi) => {
    const pp = `planets[${pi}]`;
    if (!p.accessTier) {
      p.accessTier = p.category === 'para-a-vida' ? 'FREE' : 'PREMIUM';
      rep.info(pp, 'default.planet_tier', `Acesso do planeta não informado: ${p.accessTier} (padrão da categoria)`);
    }
    if (!p.courses.length && !p.status) {
      p.status = 'COMING_SOON';
      rep.info(pp, 'default.coming_soon', 'Planeta sem cursos: marcado como "Em breve"');
    }
    p.courses.forEach((c: any, ci) => {
      const cp = `${pp}.courses[${ci}]`;
      if (!c.units.length && !c.status) {
        c.status = 'COMING_SOON';
        rep.warn(cp, 'default.course_coming_soon', `Curso "${c.title}" sem trilha: marcado como "Em breve"`);
      }
      if (p.category === 'para-o-trabalho' && !c.__certificateExplicit && !c.hasCertificate) {
        c.hasCertificate = true;
        rep.info(cp, 'default.certificate', 'Curso "Para o trabalho": certificado ligado por padrão');
      }
      delete c.__certificateExplicit;
      const tier = c.accessTier ?? p.accessTier;
      if (tier === 'FREE' && c.units.length > 2 && c.units.every((u: any) => u.accessTier == null)) {
        c.units.forEach((u: any, ui: number) => (u.accessTier = ui < 2 ? 'FREE' : 'PREMIUM'));
        rep.info(cp, 'default.free_units', 'Plano grátis: unidades 1 e 2 liberadas, demais Premium');
      }
    });
  });
  return b;
}
