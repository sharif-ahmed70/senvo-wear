# Prompt: set up or update SENVO Wear on a laptop

Two ways, both for Claude Code, Codex or Antigravity on Windows:

- **A. With the portable package (recommended).** The owner copies the
  `SENVO-Portable-*.zip` package to the laptop. Everything the agent needs is
  inside: code, Node 22, PostgreSQL 17, the shop data and pictures, and
  `setup-senvo.ps1`, which does the whole job in a fixed order.
- **B. From GitHub only**, when there is no package. Uses
  [LOCAL_SETUP.md](LOCAL_SETUP.md).

Give the agent full permission for this run so it does not stop to ask
(Claude Code: permission mode "Bypass permissions" or "Auto"; Codex: "Full
access" / `--full-auto`; Antigravity: terminal auto-execution "Always
proceed"). The prompt itself limits what the agent may change.

## A. Prompt for the portable package

Unzip the package (for example to `D:\SENVO_PORTABLE`), open the agent in
that folder and paste:

```text
You are setting up the SENVO Wear shop system on this Windows laptop. I am the
shop owner. I give you full permission to run every command this job needs
without asking me. Report to me at the end in short, simple Bangla.

The current folder is the unzipped SENVO portable package. It contains
setup-senvo.ps1, SENVO-Wear-source.zip, SOURCE_COMMIT.txt, TOOLS\ (Node 22
zip, portable PostgreSQL 17), DATABASE\ (shop backup) and MEDIA\ (pictures).

Do this:
1. Read README_BN.md and this prompt. Do not read or print .env values.
2. Run exactly:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-senvo.ps1
   It needs no admin rights and no passwords. It installs what is missing
   (portable Node, pnpm, PostgreSQL under C:\SENVO), puts the code in
   C:\xampp\htdocs\SENVO Wear, restores or keeps the data, runs
   "pnpm install" (needs internet), applies migrations, sets up the daily
   backup and desktop shortcuts, and starts everything. It decides by itself
   whether this is a NEW setup or an UPDATE of an existing one.
3. If it ends with "SETUP STOPPED: ...", read that message and the newest log
   in C:\SENVO\setup-logs\, fix only the environment, and run step 2 again.
   Allowed fixes: connect to the internet and retry, close programs that lock
   the project folder, stop other programs that use ports 3000, 3001, 4000,
   retry after a network error. Run setup at most 5 times.
4. When it prints the SUMMARY, check in a browser or with HTTP requests:
   http://localhost:4000/storefront/catalog?page=1&pageSize=1 answers 200,
   http://localhost:3001/login answers 200, http://localhost:3000/ answers 200.

Never:
- change, "fix" or reformat any file of the project, its migrations,
  package.json, pnpm-lock.yaml, or setup-senvo.ps1. This is setup only.
  If something can only be solved by changing code, stop and tell me.
- run prisma migrate dev, prisma migrate reset, prisma db push, dropdb, or
  any command that deletes or overwrites a database.
- delete or overwrite C:\SENVO\pgdata, C:\SENVO\backups, the .senvo-media
  pictures folder, any *.old-* folder, or anything in DATABASE\.
- print, log or send AUTH_SECRET, DATABASE_URL or any password.
- commit, push or upload anything; type my Admin password into a website.
- free disk space by deleting files: tell me instead.

When done, tell me in Bangla:
- NEW or UPDATE, and the code version from the SUMMARY;
- Node, pnpm and PostgreSQL versions;
- how many users and products the database has;
- whether the three addresses answered 200;
- that I start the system with the "SENVO Start" desktop icon (or
  C:\xampp\htdocs\SENVO Wear\scripts\start-local.ps1) and sign in myself at
  http://localhost:3001;
- where backups (C:\SENVO\backups) and pictures are, and to copy both to a USB
  drive every week;
- for UPDATE: the old code folder name, which I can delete later.
```

## B. Prompt without a package (GitHub)

Open the agent in an empty folder and paste. Fill in the two `<...>` lines.

```text
You are setting up the SENVO Wear shop system on this Windows laptop. I am the
shop owner. I give you full permission to run every command this job needs
without asking me. Report to me at the end in short, simple Bangla.

Job: <NEW LAPTOP setup | UPDATE the existing install>
My backup files: <folder with the newest senvo_wear_dev-*.dump and .senvo-media>

1. Clone https://github.com/sharif-ahmed70/senvo-wear.git (branch main) into
   C:\xampp\htdocs\SENVO Wear, unless that folder already exists (UPDATE).
2. Read AGENTS.md, README.md and docs/LOCAL_SETUP.md, then follow
   docs/LOCAL_SETUP.md step by step. Install missing tools yourself (Git,
   Node 22 LTS, pnpm 11.11.0 via corepack, PostgreSQL 17).
3. For UPDATE: run scripts\backup-db.ps1 first and confirm the new .dump, then
   follow docs/LOCAL_SETUP.md step 6.
4. Start with scripts\start-local.ps1 and confirm OK for API, Admin and
   Storefront.

Never: change project code, migrations, package versions or pnpm-lock.yaml;
run prisma migrate dev / migrate reset / db push or drop a database; delete
pictures or backups; print secrets; commit or push; type my Admin password.
If a database named senvo_wear_dev already exists on a NEW laptop, keep it and
tell me. Report the same results as the package prompt.
```

## Why the shop data matters

A fresh database has no organization and no Admin login, and the app has no
sign-up screen, so a working setup always starts from a backup of the shop's
data (bundled in the package, or a `.dump` you bring).
