// Notes de version de l'add-on, embarquées au build depuis tesla-pricing/CHANGELOG.md
import changelogMarkdown from '../tesla-pricing/CHANGELOG.md?raw';

export interface ChangelogRelease {
  version: string;
  changes: string[];
}

// Format attendu : « ## 1.4.0 » suivi de puces « - … » (une puce peut continuer sur les lignes suivantes)
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      releases.push({ version: heading[1], changes: [] });
      continue;
    }
    const current = releases[releases.length - 1];
    if (!current || !line.trim()) continue;
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) current.changes.push(bullet[1]);
    else if (current.changes.length) current.changes[current.changes.length - 1] += ` ${line.trim()}`;
  }
  return releases;
}

// Nouveautés pas encore publiées (renommées « ## X.Y.Z » par le workflow « Version de l'add-on ») : pas affichées dans l'appli
export const UNRELEASED = 'À venir';

export function publishedReleases(releases: ChangelogRelease[]): ChangelogRelease[] {
  return releases.filter((release) => release.version !== UNRELEASED);
}

export const CHANGELOG: ChangelogRelease[] = publishedReleases(parseChangelog(changelogMarkdown));
