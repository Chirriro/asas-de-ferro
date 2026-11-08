# Asas de Ferro

A text-first website for the **Asas de Ferro** tabletop RPG. Code, identifiers and developer documentation use English; every visitor-facing string uses Brazilian Portuguese. The initial release is designed for desktop screens.

## Features

- Simple home page, with room for more systems later.
- Public Códice with text search, category labels, clickable tags, and internal navigation.
- Three knowledge sections in each entry: **Conhecimento Geral**, **Conhecimento Específico**, and **Conhecimento Profissional**.
- Only one global public visibility level per entry (0, 1, 2). Sections above that level appear as `???` to visitors. There are **no player accounts**.
- Optional inline `{{secret}}...{{/secret}}` markers for withholding small passages even inside a visible section. Secret data is removed **before** sending the API response.
- Automatic links whenever a Códice title or alias occurs in an entry. Explicit links are also supported: `[[bolivar]]` or `[[bolivar|Bolívar]]`.
- Lightweight Markdown: paragraphs, `**bold**`, `*italic*`, `` `code` ``, `# headings`, bullet lists, and secure HTTPS links.
- Exactly one administrator with an environment-configured username and scrypt password hash. No signup or user database.
- Browser-based admin editor for new/edit/delete entries, tags, aliases, public visibility and all three content levels.
- Persistence through Netlify Functions and Netlify Blobs (site-wide storage). Edit operations survive redeployments.
- Seed content for Avalon, Bolívar, and Columbia taken from `HB-AsasdeFerro.txt`. The original paragraphs were **not rewritten**. Only document page markers and image directives were removed, and paragraphs divided into three knowledge levels.

## Project layout

```text
public/
  index.html         Home, Códice, and admin shell
  app.js             Routing, reading, links, and editor
  styles.css         Intentionally basic desktop styling
netlify/functions/
  api.mjs            Public and admin API; Netlify Blobs storage
  core.mjs           Redaction, validation, and authentication
  seed.mjs           Original three location articles
scripts/
  hash-password.mjs  Generate a password hash and session secret
  generate-seed.py    Optional repeatable import of the source TXT
tests/
  core.test.mjs      Unit tests
netlify.toml         Hosting and routing configuration
```

**Important:** Keep the GitHub repository **private**. `seed.mjs` includes all three knowledge levels, including paragraphs hidden from the public site. Publishing your repository would reveal those original passages to anyone who visits GitHub. Netlify can deploy a **public website from a private repository**.

## 1. Set up Zed, Git, and Node on Bazzite

Open a **host terminal**, not a root shell. Bazzite recommends Homebrew for CLI tools rather than layering packages into its immutable base OS. Check your existing tools:

```bash
brew --version
git --version
node --version
```

If Git or Node is missing, install them with Homebrew (do not use `sudo`):

```bash
brew install git node
```

Use **Node.js 22.13 or newer**. Install Zed with the Linux installation script described by the Zed team:

```bash
curl -f https://zed.dev/install.sh | sh
```

Restart the terminal if `zed` is not immediately on your path. Zed's Git Panel supports staging, committing, and pushing, but you can also use its integrated terminal. Zed requires working Vulkan 1.3 support on Linux.

Configure Git once, using your actual display name and GitHub email:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
```

## 2. Connect Bazzite to GitHub over SSH

Check if you already have an SSH public key:

```bash
ls -la ~/.ssh
```

If not, create an Ed25519 key and protect it with a passphrase:

```bash
ssh-keygen -t ed25519 -C "you@example.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Copy **only the public key** into GitHub → **Settings → SSH and GPG keys → New SSH key**. Never upload `~/.ssh/id_ed25519` (the private key). Test the connection:

```bash
ssh -T git@github.com
```

The first connection may ask you to confirm GitHub's SSH host key; confirm its fingerprint against GitHub's official published fingerprints.

## 3. Start the project in Zed

Extract the provided ZIP into your preferred projects folder, then enter the extracted project folder:

```bash
cd ~/Projects/asas-de-ferro
zed .
npm install
npm test
```

If your ZIP was extracted elsewhere, adjust the `cd` path. You can use the integrated terminal in Zed to run all subsequent commands.

## 4. Create the local administrator

```bash
npm run hash-password
cp .env.example .env
```

The script asks for an administrator password (16+ characters) and prints two values. Replace the example values in `.env` with the generated `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`. Keep `ADMIN_USERNAME=admin`, or choose your own admin username.

**Never commit `.env`**, your plaintext password, or the session secret. `.gitignore` excludes `.env`.

Start the local site:

```bash
npm run dev
```

Visit **http://localhost:8888**. Read the Códice and visit **http://localhost:8888/admin** to sign in. Netlify Dev uses a local sandbox for Blobs, so local edits will not alter production content.

## 5. Create and push the private GitHub repository

On GitHub, create an **empty PRIVATE repository** named `asas-de-ferro`. Do not initialize it with a README or `.gitignore` because both already exist locally. In the Zed terminal, from the project folder:

```bash
git init
git add .
git commit -m "Initial Asas de Ferro site and Codex"
git branch -M main
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/asas-de-ferro.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your GitHub username. Future updates use the Zed Git Panel, or:

```bash
git status
git add .
git commit -m "Describe the change"
git push
```

Git changes are **code changes**; content saved from the admin browser is in **Netlify Blobs**, not automatically committed to GitHub. The original seeded entries in `seed.mjs` are fallbacks; saved browser edits override them.

## 6. Deploy to Netlify

1. In Netlify, choose **Add new project → Import an existing project** and connect GitHub.
2. Select your private `asas-de-ferro` repository and its `main` branch.
3. Build command: **leave empty**. Publish directory: **`public`**. Functions directory: **`netlify/functions`**. These are already defined in `netlify.toml`.
4. Under **Project configuration → Environment variables**, add `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` with the exact values from your local `.env`. Their scope must include **Functions**. Use the production deploy context for the secrets.
5. Deploy. Open `/admin`, sign in, edit a Códice entry and save it. Changes are stored in Netlify Blobs.

Further pushes to `main` automatically trigger Netlify redeployments. The app explicitly disables editing on Netlify deploy previews and branch deploys, because site-wide Blobs are shared between deployment contexts.

## Using the Códice editor

Open `/admin`, sign in, and choose **Novo verbete** to create an entry. To edit an existing entry, open it in the Códice and click **Editar este verbete**. The URL identifier (slug) cannot change after creation, which keeps links stable.

For each entry, edit its three text fields independently. **Conhecimento público até** controls which complete sections appear to visitors:

| Selected level | Geral | Específico | Profissional |
| --- | --- | --- | --- |
| Geral | Visible | `???` | `???` |
| Específico | Visible | Visible | `???` |
| Profissional | Visible | Visible | Visible |

Inside a visible section you can additionally enter:

```text
O castelo ainda está de pé. {{secret}}O verdadeiro herdeiro vive sob o castelo.{{/secret}}
```

Visitors receive `O castelo ainda está de pé. ???`, **not** the hidden text. The admin can also use **Prévia do visitante** on an entry to inspect the result.

To link another entry, either mention its title exactly (e.g. `Columbia` or `Bolívar`) or use the explicit syntax `[[columbia|União Columbiana]]`. The destination must exist for the automatic title/alias linker to activate; explicit links use the specified identifier. Use tags for grouping and filtering. Search indexes only public metadata, not restricted bodies.

To regenerate the three sample locations from your original text file, optionally run `python scripts/generate-seed.py /path/to/HB-AsasdeFerro.txt`. This overwrites `seed.mjs` with the original paragraphs split in the same groups. Note that live Netlify Blobs edits still override these seeded entries.

## Notes and constraints

- This is deliberately a **desktop-only, text-only** foundation. No pictures, external fonts, icon libraries, or UI frameworks are used.
- There is one global public knowledge level **per Códice entry**. Since visitors have no accounts, individual players cannot have different access levels. Changing the level reveals content to **every anonymous visitor**.
- Passwords are stored as scrypt hashes in Netlify environment variables, not in the repository. Sessions are HMAC-signed, HTTP-only, same-site cookies that expire after 12 hours.
- This starter uses Netlify Blobs, not a transactional database. With one administrator, its last-write-wins behavior is acceptable. Export/backup and editorial revision history are sensible future additions.
- On a public production deployment, use a strong, unique password and consider additional login rate limiting/WAF protection. This starter does not implement account lockout or two-factor authentication.
- If the admin changes the generated seed content in the Netlify browser, the saved Blobs version takes precedence. Deleting a seeded entry creates a tombstone so it does not reappear on the next deploy.
- Secrets in **GitHub** are a separate issue from server-side redaction. Do not publish the repo while it contains hidden seeded content.
- If the Netlify API is not available, opening `public/index.html` as a file is **not a functional test**. Run through `netlify dev`, which provides Functions and local Blobs.

## Official reference documentation

- Zed Linux installation: https://zed.dev/docs/installation
- Zed Git features: https://zed.dev/docs/git
- Bazzite Homebrew: https://docs.bazzite.gg/Installing_and_Managing_Software/Homebrew/
- GitHub SSH setup: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent
- Netlify Git integration: https://docs.netlify.com/manage/projects/add-new-project/
- Netlify Functions: https://docs.netlify.com/build/functions/configuration/
- Netlify Blobs: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
