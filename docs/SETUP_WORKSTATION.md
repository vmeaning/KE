# Подготовка рабочей станции команды KE

> Для выделенного компьютера с Windows 10 Pro, на котором работает Claude Code (см. [TEAM_PROCESS.md](TEAM_PROCESS.md) §12).
> Каждый шаг заканчивается проверкой: что должно получиться. Если результат другой — остановись и напиши в штаб, что видишь.

Команды «PowerShell (админ)» выполняются в PowerShell, запущенном от имени администратора: Пуск → ввести «PowerShell» → правой кнопкой → «Запуск от имени администратора». Остальные команды — в обычном терминале (Windows Terminal или PowerShell).

---

## 1. Длинные пути в Windows
Git worktree и `node_modules` создают глубоко вложенные папки. Без этой настройки Windows обрезает пути длиннее 260 символов.

PowerShell (админ):
```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```
**Проверка:** в ответе есть строка `LongPathsEnabled : 1`. Перезагрузи компьютер.

## 2. Программы
PowerShell (админ):
```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id GitHub.cli -e
```
Если команда `winget` не найдена, установи «App Installer» из Microsoft Store или скачай установщики с git-scm.com, nodejs.org (LTS) и cli.github.com.

Закрой и снова открой терминал. Затем:
```powershell
git config --system core.longpaths true
git --version; node --version; gh --version
```
**Проверка:** три строки с версиями, `node` не ниже v22.

## 3. Git: имя и почта для коммитов
```powershell
git config --global user.name "Имя Фамилия"
git config --global user.email "почта@example.com"
```
Подставь своё имя и почту, привязанную к GitHub.

**Проверка:** `git config --global --list` показывает обе строки.

## 4. Вход в GitHub
```powershell
gh auth login --hostname github.com --git-protocol https --web --scopes workflow
gh auth setup-git
```
Откроется браузер. Войди и подтверди доступ. Scope `workflow` нужен, чтобы агенты могли менять файлы CI в `.github/workflows/`.

**Проверка:** `gh auth status` показывает `Logged in to github.com`, а в списке scopes есть `workflow`.

## 5. Claude Code
PowerShell:
```powershell
irm https://claude.ai/install.ps1 | iex
```
Закрой и снова открой терминал, затем выполни `claude`. При первом запуске войди с аккаунтом, на котором подписка Max.

**Проверка:** `claude --version` показывает версию. В сессии команда `/status` показывает твой аккаунт. Выйди из сессии (`/exit`).

## 6. Репозиторий
```powershell
gh repo clone vmeaning/KE D:\KE
cd D:\KE
npx -y playwright install chromium
```
Если диска D: нет, выбери любую папку с коротким путём, например `C:\KE`. Playwright нужен дизайнеру и тестировщику для скриншотов и e2e-тестов.

**Проверка:** в `D:\KE` есть `CLAUDE.md` и папка `.claude`. Команда `npx playwright --version` показывает версию.

## 7. Проверка предохранителей
```powershell
cd D:\KE
node --test .claude/hooks/hooks.test.mjs
```
**Проверка:** в конце вывода `# pass 10` и `# fail 0`.

## 8. Метки в GitHub
В Git Bash (Пуск → «Git Bash»):
```bash
cd /d/KE
bash scripts/setup-labels.sh
```
**Проверка:** много строк `ok  …`. На странице репозитория Issues → Labels видны метки `status:*`, `gate:*` и другие.

## 9. Защита ветки `main` и настройки PR
На GitHub в репозитории KE:

1. **Settings → General → Pull Requests:**
   - оставь включённым только **Allow squash merging**; выключи «Allow merge commits» и «Allow rebase merging»;
   - включи **Automatically delete head branches**.
2. **Settings → Rules → Rulesets → New ruleset → New branch ruleset:**
   - Ruleset name: `main`; Enforcement status: **Active**;
   - Target branches → Add target → **Include default branch**;
   - Rules — включи:
     - **Restrict deletions**;
     - **Block force pushes**;
     - **Require a pull request before merging**, Required approvals = **0**. Все агенты работают под твоим аккаунтом, а GitHub не даёт одобрить свой собственный PR. Поэтому одобрение заменяют отчёты тестировщика и гейтов.
   - Нажми **Create**.
3. После фазы 0, когда появится CI, в тот же ruleset добавим **Require status checks to pass** с проверками CI для Windows и Linux. Лид напомнит об этом.

**Проверка:** на странице Rulesets виден активный ruleset `main`.

## 10. Запуск штаба
```powershell
cd D:\KE
claude --permission-mode acceptEdits
```
Первое сообщение в сессии: `/lead status`.

- Режим `acceptEdits` разрешает агентам править файлы без подтверждения. Команды `git`, `gh`, `node`, `npm` разрешены в `.claude/settings.json`. Всё остальное Claude спросит. Опасные действия (push в `main`, force-push, правку файлов процесса субагентами) блокируют hooks.
- Если в твоём плане доступен режим `auto`, можно запускать `claude --permission-mode auto`: тогда подтверждений будет ещё меньше.
- Продолжить прошлую сессию: `claude --continue`. Новая сессия восстанавливает состояние по `/lead status`.

## 11. Питание и обновления
- Параметры → Система → Питание: «Переводить в спящий режим» → **Никогда**.
- Параметры → Обновление и безопасность → Изменить период активности: укажи часы, когда идёт работа, чтобы Windows не перезагружалась посреди задачи.

## 12. Автономный режим (позже)
Запуск по расписанию через Планировщик заданий Windows настроим отдельной задачей после фазы 0 (TEAM_PROCESS §12.5). Сейчас ничего делать не нужно.
