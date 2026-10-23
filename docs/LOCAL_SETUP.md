# Run SENVO Wear on a Windows laptop

This is the one guide for getting the shop system running on a Windows laptop
from GitHub `main`, and for updating it later. The same steps work for a person
or an AI coding agent. To hand the whole job to an agent (Claude Code, Codex,
Antigravity), paste the prompt in [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md).

> **সংক্ষেপে (বাংলা):** GitHub থেকে `main` নামান, Node 22 + pnpm + PostgreSQL 17
> ইনস্টল করুন, `.env` বানান, পুরনো ল্যাপটপের ব্যাকআপ (`.dump`) আর ছবির ফোল্ডার
> (`.senvo-media`) বসান, তারপর `scripts\start-local.ps1` চালান। পরে আপডেট করতে:
> ব্যাকআপ → `git pull` → `pnpm install` → migration → আবার start।

## What runs where

| Part       | Address                 | Notes                              |
| ---------- | ----------------------- | ---------------------------------- |
| API        | <http://localhost:4000> | Node server, talks to PostgreSQL   |
| Storefront | <http://localhost:3000> | Online shop                        |
| Admin      | <http://localhost:3001> | Owner/staff app, POS is inside it  |
| Database   | `127.0.0.1:5432`        | PostgreSQL 17, DB `senvo_wear_dev` |
| Pictures   | `.senvo-media\`         | Set by `MEDIA_STORAGE_ROOT`        |

## What you need from the old laptop

A new database has **no organization and no login**, and there is no sign-up
screen. So always bring the shop's data from the working laptop:

1. **The newest database backup**: `C:\SENVO_TRANSFER\DATABASE\senvo_wear_dev-daily-*.dump`
   (the daily backup task makes one every night; or make one now, see
   [Backups](#backups)).
2. **The pictures folder**: `<repo>\.senvo-media\` (the whole folder).
3. Your **Admin email and password** (you type the password yourself).

Copy 1 and 2 to a USB drive. Never put them on GitHub: `.env`, `.senvo-media`
and dumps are private and gitignored.

## 1. Install the tools (once)

| Tool       | Version                        | Check            |
| ---------- | ------------------------------ | ---------------- |
| Git        | latest                         | `git --version`  |
| Node.js    | 22 LTS (`>=22.13`)             | `node -v`        |
| pnpm       | 11.11.0 (from `package.json`)  | `pnpm -v`        |
| PostgreSQL | 17, port 5432, user `postgres` | `psql --version` |

pnpm through Corepack (Administrator PowerShell):

```powershell
corepack enable
corepack prepare pnpm@11.11.0 --activate
```

PostgreSQL tools live in `C:\Program Files\PostgreSQL\17\bin` (add it to
`PATH`, or use the full path). The installer asks for a `postgres` password:
choose it yourself and keep it.

## 2. Get the code from GitHub

```powershell
git clone https://github.com/sharif-ahmed70/senvo-wear.git "C:\xampp\htdocs\SENVO Wear"
cd "C:\xampp\htdocs\SENVO Wear"
git checkout main
pnpm install --frozen-lockfile
pnpm db:generate
```

Any folder works; the paths below assume `C:\xampp\htdocs\SENVO Wear`.

## 3. Create `.env`

```powershell
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Edit `.env` and set these lines (leave the rest as in `.env.example`):

```dotenv
APP_ENV=development
NEXT_PUBLIC_APP_ENV=development
DATABASE_URL=postgresql://postgres:<postgres password>@127.0.0.1:5432/senvo_wear_dev
STOREFRONT_ORGANIZATION_CODE=SENVO
NEXT_PUBLIC_SENVO_API_URL=http://localhost:4000
SENVO_API_PORT=4000
SENVO_API_ALLOWED_ORIGIN=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001
AUTH_SECRET=<the random value printed above>
MEDIA_STORAGE_ROOT="C:/xampp/htdocs/SENVO Wear/.senvo-media"
SSLCOMMERZ_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

- If the password has special characters (`@ : / # ?`), URL-encode them.
- If PostgreSQL uses trust auth, drop the password: `postgresql://postgres@127.0.0.1:5432/senvo_wear_dev`.
- `MEDIA_STORAGE_ROOT` must be an absolute path, with forward slashes, in quotes.
- Never commit `.env`, never print its values, never put secrets in `NEXT_PUBLIC_*`.

## 4. Load the shop data

```powershell
createdb -U postgres -h 127.0.0.1 senvo_wear_dev
pg_restore -U postgres -h 127.0.0.1 -d senvo_wear_dev --no-owner "D:\senvo_wear_dev-daily-YYYYMMDD-HHMMSS.dump"
```

- If `senvo_wear_dev` already exists, **stop**: do not drop it. Restore into a
  new name (for example `senvo_wear_restore`) and decide which one to keep. See
  [BACKUP_AND_RESTORE.md](operations/BACKUP_AND_RESTORE.md).
- Copy the USB `.senvo-media` folder to `C:\xampp\htdocs\SENVO Wear\.senvo-media`.

Then bring the database up to the code's schema (only adds tables/columns):

```powershell
cd packages\database
npx prisma migrate status
npx prisma migrate deploy
cd ..\..
```

Never run `prisma migrate dev`, `prisma migrate reset` or `prisma db push` on
the shop database.

## 5. Start

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-local.ps1
```

It starts PostgreSQL if needed, frees ports 3000/3001/4000, loads `.env`,
starts the API, Storefront and Admin in the background, and prints `OK` or
`FAIL` for each. The first start takes 1-3 minutes. Logs are in
`.senvo-runtime\logs\`. If one shows `FAIL`, read its log and run the script
again (a server sometimes stops on the very first start).

Stop everything: `scripts\start-local.ps1 -Stop`.

Sign in at <http://localhost:3001> with your Admin email and password. POS is
at <http://localhost:3001/pos/sell>.

## 6. Update to the newest code later

```powershell
cd "C:\xampp\htdocs\SENVO Wear"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-db.ps1
scripts\start-local.ps1 -Stop
git status                      # must be clean; if not, ask before changing anything
git pull origin main
pnpm install --frozen-lockfile
pnpm db:generate
cd packages\database; npx prisma migrate deploy; cd ..\..
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-local.ps1
```

## Backups

`scripts\backup-db.ps1` writes a checked `pg_dump` to
`C:\SENVO_TRANSFER\DATABASE\` (change with `-OutDir`) and keeps the newest 14.
It needs either trust auth or a `%APPDATA%\postgresql\pgpass.conf` line:
`127.0.0.1:5432:*:postgres:<password>`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-db.ps1
schtasks /Create /SC DAILY /ST 23:30 /TN "SENVO DB Backup" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\xampp\htdocs\SENVO Wear\scripts\backup-db.ps1\""
```

Every week, copy `C:\SENVO_TRANSFER\DATABASE` and `.senvo-media` to a USB drive.

## Troubleshooting

| Problem                               | Fix                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `FAIL` after start                    | Read `.senvo-runtime\logs\<name>.log`, fix, run `start-local.ps1` again.                   |
| API stops: `APP_ENV` / origin error   | Check `APP_ENV=development` and `SENVO_API_ALLOWED_ORIGIN` in `.env`.                      |
| Storefront empty                      | `STOREFRONT_ORGANIZATION_CODE` must match the organization in the restored data (`SENVO`). |
| Pictures missing                      | `.senvo-media` not copied, or `MEDIA_STORAGE_ROOT` is wrong / not absolute.                |
| `Can't reach database server`         | Start the PostgreSQL service; check `DATABASE_URL` and the password.                       |
| Prisma client errors after `git pull` | Run `pnpm install --frozen-lockfile` and `pnpm db:generate` again.                         |
| Build or install fails oddly          | Check free disk space on C: (keep at least 5 GB free).                                     |
| Forgot a staff password               | Owner/Admin resets it in Admin → Team.                                                     |

## Developer checks

Before pushing code changes, run the gates in [AGENTS.md](../AGENTS.md)
(`lint`, `typecheck`, `test:run`, `build`, `format:check`, `boundary:check`).
