# SENVO Wear: one prompt to set everything up

Use this after reinstalling Windows, or on any new Windows laptop. Open
Claude Code, Codex or Antigravity (in VS Code or on its own), give it full
permission for this run (Claude Code: "Bypass permissions"; Codex: "Full
access"; Antigravity: terminal "Always proceed"), and paste the text in the
box. Change the first line to `FRESH` if you want an empty shop (settings and
logins only).

Before reinstalling Windows, keep the `D:\SENVO_BACKUP` folder (or copy it to
any non-C drive or USB and plug it in). It holds what must never go to GitHub:
the shop data, pictures and private settings. Daily backups are saved there
automatically after setup.

```text
DATA: FULL

You are setting up the SENVO Wear shop system on this Windows laptop. I am the
shop owner. I give you full permission to run every command this job needs,
including downloads and installs, without asking me. Report to me at the end
in short, simple Bangla.

Project: https://github.com/sharif-ahmed70/senvo-wear (branch main). Its root
package.json has "name": "senvo-wear". My private backup is a folder named
SENVO_BACKUP on some drive (DATABASE, SEED, MEDIA, CONFIG, TOOLS inside).

1. Find the project on this laptop. First check the folder you are in, then
   C:\xampp\htdocs\SENVO Wear, then search C:\ and the other drives (folders
   up to 4 levels deep) for a package.json whose "name" is "senvo-wear". Use
   the first match.
2. If it is not found: install Git if it is missing (winget install --id
   Git.Git -e, or portable MinGit from github.com/git-for-windows if winget
   fails), then clone the project into C:\xampp\htdocs\SENVO Wear.
   If it is found and is a git clone: run git status. If it is clean, run
   git checkout main and git pull. If it has local changes, do not touch
   them: continue with the code as it is and tell me.
3. Read AGENTS.md and docs/LOCAL_SETUP.md in the project.
4. From the project folder run exactly (add -Fresh only if the first line of
   this prompt says FRESH):
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
   It needs no admin rights and no passwords. It finds SENVO_BACKUP by itself,
   installs portable Node 22, pnpm and PostgreSQL 17 under C:\SENVO if they are
   missing (from SENVO_BACKUP\TOOLS or by downloading), restores the newest
   backup, reuses the saved .env settings, runs pnpm install (internet),
   applies migrations, sets up the daily backup and desktop shortcuts, and
   starts everything.
5. If it ends with "SETUP STOPPED: ...", read the message and the newest log
   in C:\SENVO\setup-logs, fix only the environment (internet, a program
   holding the folder or ports 3000/3001/4000, a missing tool), and run step 4
   again, at most 5 times. If it says no shop data was found, stop and tell me
   to plug in the drive with SENVO_BACKUP.
6. Check http://localhost:4000/storefront/catalog?page=1&pageSize=1,
   http://localhost:3001/login and http://localhost:3000/ all answer 200.

Never:
- change, fix or reformat project files, migrations, package.json,
  pnpm-lock.yaml or the setup scripts. If only a code change would help, stop
  and tell me.
- run prisma migrate dev, prisma migrate reset, prisma db push, dropdb, or
  anything that deletes or overwrites a database or the SENVO_BACKUP folder.
- print, log, commit or upload .env values, passwords, database dumps or
  pictures. The GitHub repository is public.
- commit or push anything, or type my Admin password into a website.
- delete files to free disk space: tell me instead.

When done, tell me in Bangla: FULL or FRESH data and how many users and
products the database has; the Node, pnpm and PostgreSQL versions; whether
the three addresses answered 200; where the project is (open that folder in
VS Code for future work); that I start the system with the "SENVO Start"
desktop icon and sign in myself at http://localhost:3001; and that daily
backups go to SENVO_BACKUP\DATABASE.
```
