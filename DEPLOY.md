# Varshyl Scheduling — Deploy Instructions

## ⚡ 2 things needed to go live

### 1. Push to GitHub (run these in Terminal from this folder)

```bash
cd "/Users/vagkapi/Documents/Claude/Projects/Soren and Schedule/varshyl-scheduling"
git remote set-url origin https://YOUR_GITHUB_TOKEN@github.com/VagishKapila/varshyl-scheduling.git
git push origin main
```

Get a token at: https://github.com/settings/tokens → Generate new token (classic) → check `repo`

---

### 2. Set environment variables in Railway

In your Railway project dashboard → Variables tab, add:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@postgres.railway.internal:5432/railway
NEXTAUTH_SECRET=varshyl-scheduling-secret-change-this-in-prod
NEXTAUTH_URL=https://varshyl-scheduling-production.up.railway.app
NODE_ENV=production
```

**Railway build command:** `npx prisma generate && npm run build`
**Railway start command:** `node .next/standalone/server.js`

---

### 3. Run DB migration + seed (once Railway deploys)

In Railway → your service → shell tab:
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

Or locally with the public URL:
```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@thomas.proxy.rlwy.net:40537/railway" npx prisma migrate dev --name init
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@thomas.proxy.rlwy.net:40537/railway" npx prisma db seed
```

---

### 4. Netlify (frontend)

In Netlify → Site settings → Build & Deploy:
- Build command: `npm run build`
- Publish directory: `.next`
- Environment variable: `NEXTAUTH_URL=https://scheduling.varshyl.com`

---

## Once live, test this flow:
1. Sign up at `/login`
2. Set company name + logo at `/onboarding`  
3. Create project → Select template → Generate schedule
4. View Gantt → click tasks → edit drawer
5. Add Hold → see downstream shift
6. Print PDF → verify header/footer
