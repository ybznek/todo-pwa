# Todo PWA

Progresivní webová aplikace pro správu úkolů s lokální markdown databází.

Postaveno na **Vite 6**, **TypeScript 5** a **vite-plugin-pwa**.

## Funkce

- Ukládání dat do `.md` souboru na PC přes **File System Access API** (`FileSystemFileHandle`)
- Smazané úkoly zůstávají v souboru jako HTML komentáře
- Kliknutím na úkol se stane aktivním a začne se počítat čas + pomodoro (25 min práce / 5 min pauza)
- Odškrtávání hotových úkolů
- Statistiky času a počtu pomodoro pro každý úkol
- PWA s offline podporou (Workbox service worker)

## Požadavky

- Node.js 20+
- Chromium prohlížeč (Chrome, Edge, Opera) kvůli File System Access API
- Pro nasazenou verzi: důvěryhodný HTTPS certifikát (viz níže)

## HTTPS (homelab)

Nasazená appka běží na **https://todo-pwa.192.168.0.101.sslip.io**.

Certifikát vydává lokální **Homelab CA** (cert-manager). Let's Encrypt na privátní
`sslip.io` adrese nefunguje — CA je správné řešení pro LAN.

Jednorázově nainstaluj CA na PC, aby prohlížeč HTTPS důvěřoval:

```bash
./deploy/export-homelab-ca.sh homelab-ca.crt
# Linux
sudo cp homelab-ca.crt /usr/local/share/ca-certificates/homelab-ca.crt
sudo update-ca-certificates
# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain homelab-ca.crt
```

Po instalaci CA funguje File System Access API (přímý zápis `.md` souboru).

## Spuštění

```bash
cd /p/todo-pwa
npm install
npm run dev
```

Produkční build:

```bash
npm run build
npm run preview
```

## Testy

```bash
npm test
```

## Formát souboru

```markdown
---
active: uuid-aktivniho-ukolu
---

# Todo PWA

## Úkoly

- [ ] Nákup mléka <!-- id:... time:125000 pomodoros:2 created:2026-09-22T08:00:00.000Z -->

<!-- smazáno: - [ ] Starý úkol id:... time:0 pomodoros:0 created:... deleted:... -->
```
