# Prompt: set up or update SENVO Wear on this laptop

Copy everything inside the box below and paste it into Claude Code, Codex or
Antigravity, opened in an empty folder (new laptop) or in the project folder
(update). Fill in the two lines marked `<...>` first.

```text
You are setting up the SENVO Wear shop system on this Windows laptop. I am the
shop owner. Report to me in short, simple Bangla.

Job: <NEW LAPTOP setup  |  UPDATE the existing install>   (I kept one)
My backup files are here: <for example D:\SENVO_BACKUP> (the newest
senvo_wear_dev-daily-*.dump and the .senvo-media folder). Leave empty for UPDATE.

Source of truth:
- Code: https://github.com/sharif-ahmed70/senvo-wear.git, branch main.
- Project folder: C:\xampp\htdocs\SENVO Wear (use it unless I say otherwise).
- After cloning, read and follow docs/LOCAL_SETUP.md step by step. Also read
  AGENTS.md and README.md. If anything in this prompt disagrees with
  docs/LOCAL_SETUP.md, follow docs/LOCAL_SETUP.md and tell me.

What you may do without asking me:
- Install Git, Node.js 22 LTS, pnpm 11.11.0 (corepack) and PostgreSQL 17 if
  they are missing. Keep installed versions that already meet the guide.
- Clone the repo, run pnpm install --frozen-lockfile, pnpm db:generate.
- Create .env from .env.example with the values in docs/LOCAL_SETUP.md step 3,
  generating a fresh AUTH_SECRET.
- Create the database senvo_wear_dev if it does not exist, restore my newest
  dump into it with pg_restore --no-owner, copy .senvo-media, and run
  npx prisma migrate deploy from packages\database.
- Start it with scripts\start-local.ps1 and fix start-up problems by reading
  .senvo-runtime\logs\*.log.
- Set up the daily backup task from docs/LOCAL_SETUP.md "Backups".

For UPDATE: first run scripts\backup-db.ps1 and confirm a new .dump exists,
then follow docs/LOCAL_SETUP.md step 6. If git status is not clean, stop and
show me the changed files before doing anything.

Ask me first (and wait) before you:
- need a password: let ME type the PostgreSQL password into the installer and
  into .env myself, or tell you once; never print it, log it, or store it
  anywhere except .env and pgpass.conf;
- would drop, overwrite, reset or "clean" any database, the .senvo-media
  folder, or any backup file. If senvo_wear_dev already exists on a new
  laptop, stop and ask.

Never:
- run prisma migrate dev, prisma migrate reset or prisma db push;
- change source code, migrations, package versions or pnpm-lock.yaml;
  this is setup only, unless I ask for a code change;
- commit, push, or upload .env, dumps, pictures or anything else online;
- type my Admin password into the website: I sign in myself.

Done means (show me each result):
1. Versions of Git, Node, pnpm and PostgreSQL.
2. The database restored: number of users and products
   (SELECT count(*) FROM users; SELECT count(*) FROM products;).
3. prisma migrate status says the database is up to date.
4. scripts\start-local.ps1 prints OK for API, Admin and Storefront.
5. The daily backup task exists and one backup file was made.
Then tell me in Bangla: the one command to start the system each day, where
my pictures and backups are, and to copy the backups and .senvo-media to a USB
drive every week.
```

## Why the prompt asks for a backup

A fresh database has no organization and no Admin login, and the app has no
sign-up screen, so a working setup always starts from a backup of the shop's
data. See [LOCAL_SETUP.md](LOCAL_SETUP.md#what-you-need-from-the-old-laptop).
