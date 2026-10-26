# Deployment auf den Hetzner-Server

Gleiches Schema wie teamtafel und schul-ag-portal: Der gemeinsame Traefik (aus dem schul-ag-portal-Repo, Netz `proxy`, Resolver `letsencrypt`) findet den Container über seine Labels und holt das Zertifikat.

- **Push auf `main`** → Image-Tag `staging` → `tt-turnier-staging` (hinter der BasicAuth `auth` des Traefik)
- **release-please-PR mergen** → Release `vX.Y.Z` → Image-Tags `X.Y.Z` + `latest` → `tt-turnier` (Produktion)

Der Workflow kopiert `compose.yaml` und `compose.staging.yaml` nach `~/tt-turnier/` und startet per SSH `docker compose pull` + `up -d --wait`. Die `.env.<umgebung>` schreibt er bei jedem Deploy neu aus den Secrets.

## Einmalige Einrichtung

1. **DNS:** A-Records für die Subdomain und `staging.`-Subdomain auf den Server.
2. **Repo-Secrets** (Werte wie in teamtafel): `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`.
3. **Environments** `staging` und `production` (Settings → Environments), jeweils mit den Secrets:
   - `APP_HOST`, z. B. `turnier.schwarzpost.de` bzw. `staging.turnier.schwarzpost.de`
   - `TT_ADMIN_PIN`: lange, zufällige PIN ohne Anführungszeichen. Gilt für jedes neu angelegte Turnier statt `admin123`.
4. **release-please:** Secret `RELEASE_PLEASE_TOKEN` (Fine-grained PAT nur für dieses Repo, *Contents* + *Pull requests* read/write). Ohne ihn startet CI auf dem Release-PR nicht und `main` lässt ihn wegen der Pflicht-Checks nicht mergen. Außerdem unter Settings → Actions → General *Allow GitHub Actions to create and approve pull requests* aktivieren.

## Daten
Die SQLite-DB liegt im Docker-Volume `tt-turnier_data` (Staging: `tt-turnier-staging_data`). Sichern:
```bash
docker run --rm -v tt-turnier_data:/d alpine cat /d/turnier.db > turnier.db
```
