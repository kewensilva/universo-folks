import { BadRequestException, Global, Injectable, Logger, Module, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseVimeoUrl } from '../common/utils';

export interface VimeoVideoInfo {
  id: string;
  hash?: string;
  name?: string;
  durationSeconds?: number;
  link?: string;
  thumbnail?: string;
  /** anybody | unlisted | disable | password | nobody ... */
  privacyView?: string;
  /** public | whitelist | private */
  privacyEmbed?: string;
  /** available | uploading | transcoding | ... */
  status?: string;
}

export interface VimeoFolderNode { id: string; name: string; folders: VimeoFolderNode[]; videos: VimeoVideoInfo[] }
const VIDEO_FIELDS = 'uri,name,duration,link,player_embed_url,pictures.base_link,privacy.view,privacy.embed,status';

/**
 * Integração com o Vimeo, onde os vídeos já estão organizados em pastas.
 *
 * Token (developer.vimeo.com > seu app > "Generate access token", tipo Authenticated)
 * com os escopos: public, private, video_files (opcional) e edit (para liberar o
 * embed só nos domínios do app). Coloque em VIMEO_ACCESS_TOKEN.
 * Sem token o serviço só interpreta a URL (id/hash).
 */
@Injectable()
export class VimeoService {
  private readonly log = new Logger(VimeoService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return !!this.config.get('VIMEO_ACCESS_TOKEN');
  }

  private get baseUrl() {
    return this.config.get<string>('VIMEO_API_URL', 'https://api.vimeo.com').replace(/\/$/, '');
  }

  /** Domínios onde o player pode ser incorporado (web + app). */
  get embedDomains(): string[] {
    return (this.config.get<string>('VIMEO_EMBED_DOMAINS') ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  }

  parse(url: string) {
    return parseVimeoUrl(url);
  }

  /** Diagnóstico da conexão: conta, plano e escopos do token. */
  async status() {
    if (!this.enabled) return { connected: false, reason: 'VIMEO_ACCESS_TOKEN não configurado' };
    try {
      const [me, verify] = await Promise.all([this.request('/me?fields=name,uri,account,link'), this.request('/oauth/verify').catch(() => null)]);
      const scopes: string[] = String(verify?.scope ?? '').split(' ').filter(Boolean);
      return {
        connected: true,
        account: { name: me.name, plan: me.account, uri: me.uri, link: me.link },
        scopes,
        missingScopes: ['public', 'private'].filter((s) => !scopes.includes(s)),
        canEditPrivacy: scopes.includes('edit'),
        embedDomains: this.embedDomains,
      };
    } catch (e: any) {
      return { connected: false, reason: e?.message ?? String(e) };
    }
  }

  async getVideo(urlOrId: string): Promise<VimeoVideoInfo | null> {
    const parsed = /^\d+$/.test(urlOrId) ? { id: urlOrId } : this.parse(urlOrId);
    if (!parsed) return null;
    if (!this.enabled) return parsed;
    try {
      return { ...parsed, ...this.mapVideo(await this.request(`/videos/${parsed.id}?fields=${VIDEO_FIELDS}`)), hash: parsed.hash ?? undefined };
    } catch (e: any) {
      this.log.warn(`Falha ao consultar vídeo ${parsed.id} no Vimeo: ${e?.message}`);
      return parsed;
    }
  }

  /** Pastas da conta (no Vimeo as pastas são "projects"). */
  async listFolders() {
    this.assertEnabled();
    const all = await this.paginate('/me/projects?per_page=100&fields=uri,name,metadata.connections.videos.total');
    return all.map((f: any) => ({ id: String(f.uri).split('/').pop(), name: f.name, videos: f.metadata?.connections?.videos?.total ?? null }));
  }

  /** Todos os vídeos de uma pasta (percorre todas as páginas). */
  async listFolder(folderId: string) {
    this.assertEnabled();
    const all = await this.paginate(`/me/projects/${encodeURIComponent(folderId)}/videos?per_page=100&fields=${VIDEO_FIELDS}`);
    const videos = all.map((v: any) => this.mapVideo(v));
    return { folderId, total: videos.length, videos };
  }

  /**
   * Conteúdo de uma pasta com as subpastas (ex.: planeta → módulos/cursos → vídeos).
   * Desce até `depth` níveis; cada subpasta traz os próprios vídeos.
   */
  async folderTree(folderId: string, depth = 2): Promise<VimeoFolderNode> {
    this.assertEnabled();
    const items = await this.paginate(`/me/projects/${encodeURIComponent(folderId)}/items?per_page=100`);
    const node: VimeoFolderNode = { id: folderId, name: '', folders: [], videos: [] };
    // subpastas lidas em paralelo (cada uma é uma chamada ao Vimeo)
    node.folders = await Promise.all(
      items.filter((it: any) => it.type === 'folder' && it.folder).map(async (it: any) => {
        const id = String(it.folder.uri).split('/').pop()!;
        return depth > 1 ? { ...(await this.folderTree(id, depth - 1)), name: it.folder.name } : { id, name: it.folder.name, folders: [], videos: [] };
      }),
    );
    for (const it of items) if (it.type === 'video' && it.video) node.videos.push(this.mapVideo(it.video));
    return node;
  }

  /**
   * Transcrição do vídeo a partir das legendas do Vimeo (manuais ou automáticas), em texto corrido.
   * Base para o Claude escrever a prática do que o vídeo realmente ensina. null = sem legenda.
   */
  async transcript(videoId: string): Promise<{ language: string; type: string; text: string } | null> {
    this.assertEnabled();
    const r: any = await this.request(`/videos/${encodeURIComponent(videoId)}/texttracks?fields=language,type,link,active,name`);
    const tracks: any[] = r.data ?? [];
    if (!tracks.length) return null;
    const t = tracks.find((x) => String(x.language ?? '').startsWith('pt')) ?? tracks[0];
    const res = await fetch(t.link);
    if (!res.ok) return null;
    const vtt = await res.text();
    // VTT -> texto: tira cabeçalho, números, tempos e repetições
    const lines = vtt.split(/\r?\n/).filter((l) => l && l !== 'WEBVTT' && !/^\d+$/.test(l) && !l.includes('-->') && !/^(NOTE|Kind:|Language:)/.test(l));
    const text = lines.map((l) => l.replace(/<[^>]+>/g, '').trim()).filter((l, i, a) => l && l !== a[i - 1]).join(' ');
    return { language: t.language, type: t.type, text };
  }

  /**
   * Restringe o embed do vídeo aos domínios do app (VIMEO_EMBED_DOMAINS),
   * para o vídeo não tocar fora da plataforma. Exige escopo "edit".
   */
  async restrictEmbedToApp(videoId: string) {
    this.assertEnabled();
    const domains = this.embedDomains;
    if (!domains.length) return { applied: false, reason: 'VIMEO_EMBED_DOMAINS vazio' };
    await this.request(`/videos/${videoId}`, { method: 'PATCH', body: { privacy: { embed: 'whitelist' } } });
    for (const d of domains) await this.request(`/videos/${videoId}/privacy/domains/${encodeURIComponent(d)}`, { method: 'PUT' });
    return { applied: true, domains };
  }

  private mapVideo(v: any): VimeoVideoInfo {
    const id = String(v.uri ?? '').split('/').pop()!;
    // vídeos "unlisted" têm o hash no link (vimeo.com/123/abcdef) ou no player_embed_url (?h=)
    const fromLink = v.link ? this.parse(v.link)?.hash : undefined;
    const fromEmbed = typeof v.player_embed_url === 'string' ? v.player_embed_url.match(/[?&]h=([a-zA-Z0-9]+)/)?.[1] : undefined;
    return {
      id,
      hash: fromLink ?? fromEmbed,
      name: v.name,
      durationSeconds: v.duration,
      link: v.link,
      thumbnail: v.pictures?.base_link,
      privacyView: v.privacy?.view,
      privacyEmbed: v.privacy?.embed,
      status: v.status,
    };
  }

  private assertEnabled() {
    if (!this.enabled) throw new ServiceUnavailableException('Integração com o Vimeo não configurada (VIMEO_ACCESS_TOKEN)');
  }

  private async paginate(path: string) {
    const out: any[] = [];
    let next: string | null = path;
    for (let i = 0; next && i < 50; i++) {
      const r: any = await this.request(next);
      out.push(...(r.data ?? []));
      next = r.paging?.next ?? null;
    }
    return out;
  }

  private async request(path: string, opts: { method?: string; body?: unknown } = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.config.get('VIMEO_ACCESS_TOKEN')}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 404) throw new BadRequestException(`Vimeo: recurso não encontrado (${path.split('?')[0]})`);
    if (res.status === 401 || res.status === 403) throw new BadRequestException(`Vimeo: token sem permissão para ${path.split('?')[0]} (verifique os escopos)`);
    if (!res.ok) throw new Error(`Vimeo HTTP ${res.status}`);
    return res.status === 204 ? {} : ((await res.json()) as any);
  }
}

@Global()
@Module({ providers: [VimeoService], exports: [VimeoService] })
export class VimeoModule {}
