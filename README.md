# sylvan-muse
Finding inspiration hidden deep within the wild forest.

A small, bilingual (Tiếng Việt / English) static gallery: one photograph, one poem, one song.
No build step: `index.html`, `style.css`, `script.js`, `i18n.js`, `assets/`.

*Where the Poem Blooms* (Nơi thơ nở) — photographed by Khoazd at Conkle's Hollow, Hocking Hills, Ohio, October 18, 2026.

## Where things live

| What | Where |
| --- | --- |
| All visible text, placard details, poem (VI original, EN draft) | `i18n.js` |
| Formspree form ID (**still to set**) | `script.js` → `CONFIG.formspreeId` |
| YouTube video (official "Holocene") | `script.js` → `CONFIG.youtubeVideoId` |

Run it locally (any static server works):

```bash
npx http-server@14.1.1 -p 5173 -c-1
```

Then open http://localhost:5173. Open the page over http, not `file://`, because the YouTube player needs a real origin.

## 1. Set up Formspree (free)

1. Sign up at https://formspree.io with the email address that should receive the notes.
2. Click **+ New Form**, name it "Sylvan Muse", and keep the email target as your address.
3. Copy the form endpoint, e.g. `https://formspree.io/f/xyzabcd`. The ID is the last part: `xyzabcd`.
4. In `script.js` set `formspreeId: "xyzabcd"`.
5. Deploy (below), visit the live site, choose **Yes, I love it**, and send a test note. The first submission
   triggers a confirmation email from Formspree; confirm it, and later notes go straight to your inbox.
6. Optional: under the form's **Settings → Restrict to domain**, add your live domain so other sites can't post to it.

The free plan allows 50 submissions a month. Until an ID is set, the site still shows the thank-you message
and logs a warning in the console instead of sending.

## 2. Deploy on GitHub Pages (start here)

1. Commit and push to GitHub:
   ```bash
   git add -A
   ```
   ```bash
   git commit -m "Build the Sylvan Muse gallery"
   ```
   ```bash
   git push origin main
   ```
2. On GitHub, open the repo → **Settings → Pages**.
3. Under **Build and deployment**, set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, then **Save**.
4. After a minute or two the site is live at `https://<your-username>.github.io/sylvan-muse/`.
   All paths in the site are relative, so the `/sylvan-muse/` subpath works as is.

Each push to `main` redeploys automatically.

## 3. Deploy on Cloudflare Pages (preferred later)

1. Sign in at https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
2. Authorize GitHub and pick the `sylvan-muse` repository.
3. Build settings: **Framework preset: None**, **Build command:** leave empty, **Build output directory:** `/`.
4. **Save and Deploy**. The site goes live at `https://sylvan-muse.pages.dev` (or a similar name), and each push to `main` redeploys.

## 4. Connect a custom domain later

**GitHub Pages**
1. Repo → **Settings → Pages → Custom domain**: enter e.g. `gallery.example.com` and save. GitHub commits a `CNAME` file for you.
2. At your DNS provider:
   - Subdomain (`gallery.example.com`): add a **CNAME** record `gallery` → `<your-username>.github.io`.
   - Apex domain (`example.com`): add **A** records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
     (and optionally **AAAA** `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`).
3. Wait for the DNS check to pass, then tick **Enforce HTTPS**.

**Cloudflare Pages**
1. Project → **Custom domains → Set up a custom domain**, enter the domain.
2. If the domain's DNS is on Cloudflare, the record is added for you. Otherwise add the **CNAME** it shows
   (`gallery` → `sylvan-muse.pages.dev`) at your DNS provider.
3. HTTPS is issued automatically.

After switching domains, add the new domain to Formspree's **Restrict to domain** list.
