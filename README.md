# Todo PWA

Progresivní webová aplikace pro správu úkolů s lokální markdown databází.

## Funkce

- Ukládání dat do `.md` souboru na PC přes **File System Access API** (`FileSystemFileHandle`)
- Smazané úkoly zůstávají v souboru jako HTML komentáře
- Kliknutím na úkol se stane aktivním a začne se počítat čas + pomodoro (25 min práce / 5 min pauza)
- Odškrtávání hotových úkolů
- Statistiky času a počtu pomodoro pro každý úkol
- PWA s offline podporou (service worker)

## Požadavky

- Chromium prohlížeč (Chrome, Edge, Opera) kvůli File System Access API
- Lokální server nebo HTTPS (pro service worker)

## Spuštění

```bash
cd /p/todo-pwa
python3 -m http.server 5173
```

Otevřete `http://localhost:5173`.

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

## Testy

```bash
node test/markdown.test.mjs
```
