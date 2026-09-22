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
