export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  /** caminho legível: planets[0].courses[1].units[0].lessons[2] */
  path: string;
  /** código estável para o front e para testes */
  code: string;
  message: string;
}

export class Reporter {
  readonly issues: Issue[] = [];
  error(path: string, code: string, message: string) { this.issues.push({ severity: 'error', path, code, message }); }
  warn(path: string, code: string, message: string) { this.issues.push({ severity: 'warning', path, code, message }); }
  info(path: string, code: string, message: string) { this.issues.push({ severity: 'info', path, code, message }); }
  get errors() { return this.issues.filter((i) => i.severity === 'error'); }
  get warnings() { return this.issues.filter((i) => i.severity === 'warning'); }
}
