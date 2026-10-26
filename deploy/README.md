# Deployment auf dem Server

Gleiches Schema wie der ubiqiti-Stack: Traefik findet den Container über seine Labels im Docker-Netz `rs_proxy` und holt das TLS-Zertifikat per Let's Encrypt, ein self-hosted Runner auf dem Server führt `deploy/deploy.sh` aus.

Ablauf:
1. Commits mit `feat:`/`fix:` auf `main` → release-please hält einen Release-PR offen (Version + `CHANGELOG.md`).
2. Release-PR mergen → GitHub-Release `vX.Y.Z` → Image `ghcr.io/ruben-sch/tt-hobbyturnier:X.Y.Z` (+ `latest`).
3. Der Runner auf dem Server ruft `deploy/deploy.sh X.Y.Z` auf: Platz prüfen, `pull`, `up --wait` (wartet auf den Healthcheck), alte Images aufräumen.

Schlägt ein Deploy fehl, läuft der alte Container weiter und GitHub schickt eine Mail.

## Einmalige Einrichtung

**0. Traefik mit HTTPS** (nur falls auf dem Server noch keiner läuft): `deploy/traefik/docker-compose.yml` ist Traefik v2.11 wie im ubiqiti-Stack, zusätzlich mit Port 443, Let's-Encrypt-Zertifikaten und einer Umleitung von HTTP auf HTTPS:
```bash
ACME_EMAIL=du@example.de docker compose -f deploy/traefik/docker-compose.yml up -d
```
Läuft schon ein Traefik, in der `.env` `TT_ENTRYPOINT`, `TT_CERTRESOLVER` und `TT_PROXY_NETWORK` auf dessen Namen setzen.

**1. Stack-Verzeichnis mit `.env`** auf dem Server anlegen (Vorlage `deploy/.env.example`):
```bash
mkdir -p ~/tt-turnier && cp deploy/.env.example ~/tt-turnier/.env && chmod 600 ~/tt-turnier/.env
```
`TT_HOST` = Subdomain, `TT_ADMIN_PIN` = lange, zufällige PIN (gilt für jedes neu angelegte Turnier, statt `admin123`).

**2. DNS:** A-/AAAA-Record der Subdomain auf den Server, Ports 80 und 443 in der Hetzner-Firewall offen.

**3. Self-hosted Runner** für dieses Repo: GitHub → Settings → Actions → Runners → *New self-hosted runner* (Linux x64). Label `hetzner` vergeben (anderes Label: Repo-Variable `DEPLOY_RUNNER_LABEL`), als Dienst installieren:
```bash
sudo ./svc.sh install <user> && sudo ./svc.sh start
```
Der User muss in der Gruppe `docker` sein. Runner sind pro Repo; der des ubiqiti-Repos reicht nicht.

**4. Repo-Einstellungen** (Settings → Secrets and variables → Actions):
- Variable `STACK_DIR` (Pflicht): z. B. `/home/ruben/tt-turnier`
- Variable `MIN_FREE_GB` (optional, Default 2)
- Secret `RELEASE_PLEASE_TOKEN`: Fine-grained PAT nur für dieses Repo mit *Contents* und *Pull requests* (read/write). Ohne ihn startet CI auf dem Release-PR nicht und der PR ist wegen der Pflicht-Checks nicht mergebar.
- Settings → Actions → General: *Allow GitHub Actions to create and approve pull requests* aktivieren.

## Manuell deployen / Rollback
Actions → *Release* → *Run workflow*: `tag` = Version (z. B. `1.0.0`) oder `latest`, `check_only` prüft nur.
Auf dem Server: `STACK_DIR=~/tt-turnier deploy/deploy.sh 1.0.0`.

## Daten
Die SQLite-DB liegt im Docker-Volume `tt-turnier-data`. Sichern z. B. per `docker run --rm -v tt-turnier-data:/d alpine cat /d/turnier.db > turnier.db` (am besten nicht während eines laufenden Turniers).
