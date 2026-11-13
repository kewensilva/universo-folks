import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { InteractiveStandard } from '@prisma/client';

export interface ParsedPackage {
  standard: InteractiveStandard;
  title?: string;
  launchPath: string;
  activityId?: string;
  manifest: unknown;
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: any): string | undefined => (typeof v === 'string' ? v : v?.['#text'] ?? v?.langstring?.['#text'] ?? v?.langstring);

/**
 * Detecta o padrão do pacote:
 *  - cmi5.xml          -> cmi5 (xAPI com regras de launch/AU)
 *  - tincan.xml        -> xAPI (Tin Can)
 *  - imsmanifest.xml   -> SCORM 1.2 ou 2004 (pela schemaversion)
 */
export function parsePackage(zip: AdmZip): ParsedPackage {
  const read = (name: string) => {
    const e = zip.getEntries().find((x) => x.entryName.toLowerCase() === name);
    return e ? zip.readAsText(e) : null;
  };

  const cmi5 = read('cmi5.xml');
  if (cmi5) {
    const doc = xml.parse(cmi5);
    const course = doc.courseStructure?.course;
    const au = arr(doc.courseStructure?.au)[0] ?? arr(doc.courseStructure?.block).flatMap((b: any) => arr(b.au))[0];
    if (!au) throw new Error('cmi5.xml sem AU');
    return { standard: 'CMI5', title: text(course?.title), launchPath: text(au.url)!, activityId: au['@_id'], manifest: doc };
  }

  const tincan = read('tincan.xml');
  if (tincan) {
    const doc = xml.parse(tincan);
    const act = arr(doc.tincan?.activities?.activity).find((a: any) => a.launch) ?? arr(doc.tincan?.activities?.activity)[0];
    if (!act?.launch) throw new Error('tincan.xml sem launch');
    return { standard: 'XAPI', title: text(act.name), launchPath: text(act.launch)!, activityId: act['@_id'], manifest: doc };
  }

  const ims = read('imsmanifest.xml');
  if (ims) {
    const doc = xml.parse(ims);
    const m = doc.manifest;
    const version = String(m?.metadata?.schemaversion ?? '');
    const standard: InteractiveStandard = /2004|CAM 1\.3/i.test(version) ? 'SCORM_2004' : 'SCORM_12';
    const org = arr(m?.organizations?.organization).find((o: any) => o['@_identifier'] === m?.organizations?.['@_default']) ?? arr(m?.organizations?.organization)[0];
    const firstItem = (items: any[]): any => {
      for (const it of items) {
        if (it['@_identifierref']) return it;
        const child = firstItem(arr(it.item));
        if (child) return child;
      }
    };
    const item = firstItem(arr(org?.item));
    const resources = arr(m?.resources?.resource);
    const res = resources.find((r: any) => r['@_identifier'] === item?.['@_identifierref']) ?? resources.find((r: any) => r['@_href']);
    if (!res?.['@_href']) throw new Error('imsmanifest.xml sem recurso lançável');
    const base = res['@_base'] ?? '';
    const params = item?.['@_parameters'] ?? '';
    return { standard, title: text(org?.title), launchPath: `${base}${res['@_href']}${params}`, activityId: m['@_identifier'], manifest: doc };
  }

  throw new Error('Pacote não reconhecido: esperado imsmanifest.xml (SCORM), tincan.xml (xAPI) ou cmi5.xml');
}
