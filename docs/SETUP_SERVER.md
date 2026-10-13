# Подготовка сервера команды KE

> Для Linux-VM, на которой круглосуточно работает команда агентов ([TEAM_PROCESS.md](TEAM_PROCESS.md) §12). Решение ВП от 2026-10-13: [предложение](proposals/2026-10-13-agent-server.md).
> Каждый шаг заканчивается проверкой: что должно получиться. Если результат другой — остановись и напиши в штаб, что видишь.

**Обозначения.** «На твоём ПК» — команды в PowerShell на твоём компьютере. «root» — команды на VM под пользователем `root`. «ke» — команды на VM под пользователем `ke`, от имени которого работают агенты. У пользователя `ke` нет прав администратора: даже если агент ошибётся, систему он не сломает.

---

## 1. SSH-ключ (на твоём ПК)
В Windows 10 клиент SSH уже встроен.
```powershell
ssh-keygen -t ed25519 -C "ke-server"
```
На вопросы можно отвечать Enter. Пароль к ключу лучше задать.

**Проверка:** `type $HOME\.ssh\id_ed25519.pub` печатает строку, которая начинается с `ssh-ed25519`.

## 2. Создать VM
У провайдера VM выбери:
- **ОС:** Ubuntu 24.04 LTS, x64;
- **размер на старте:** 2 vCPU, 8 ГБ RAM, 40 ГБ SSD. Перед фазой 0 увеличишь (шаг 14), поэтому выбирай тариф, который можно менять без переустановки;
- **страна дата-центра:** только из [списка поддерживаемых Anthropic](https://platform.claude.com/docs/ru/api/supported-regions);
- **SSH-ключ:** вставь строку из шага 1;
- **резервное копирование или снапшоты:** включи, если провайдер предлагает.

**Проверка:** на твоём ПК `ssh root@<IP>` пускает без пароля, а `lsb_release -d` на VM показывает `Ubuntu 24.04`.

## 3. Базовая защита (root)
```bash
apt update && apt -y full-upgrade
apt -y install unattended-upgrades ufw
timedatectl set-timezone Europe/Moscow        # подставь свой часовой пояс

# Пользователь для агентов, вход по тому же ключу
adduser --disabled-password --gecos "" ke
mkdir -p /home/ke/.ssh && cp /root/.ssh/authorized_keys /home/ke/.ssh/
chown -R ke:ke /home/ke/.ssh && chmod 700 /home/ke/.ssh && chmod 600 /home/ke/.ssh/authorized_keys

# Только вход по ключу
printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-ke.conf
systemctl restart ssh

# Firewall: открыт только SSH
ufw allow OpenSSH && ufw --force enable

# Swap 4 ГБ: запас памяти для параллельных агентов
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```
**Не закрывай** окно с root, пока не пройдёшь проверку.

**Проверка:**
- в новом окне PowerShell `ssh ke@<IP>` пускает без пароля;
- в окне root команда `ufw status` показывает `Status: active` и `OpenSSH ALLOW`;
- `free -h` показывает строку `Swap:` размером 4.0Gi.

## 4. Программы (root)
```bash
apt -y install git tmux jq curl ca-certificates

# GitHub CLI из официального репозитория
mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list

# Node.js 22 LTS: на нём работают hooks и скрипты процесса
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt update && apt -y install gh nodejs

# Системные библиотеки для Chromium (Playwright: скриншоты дизайнера, e2e-тесты)
npx -y playwright install-deps chromium
```
**Проверка:** `git --version; gh --version; node --version` — три версии, `node` не ниже v22.

## 5. Git: имя и почта (ke)
```bash
git config --global user.name "Имя Фамилия"
git config --global user.email "почта@example.com"
```
Подставь имя и почту, привязанную к GitHub.

**Проверка:** `git config --global --list` показывает обе строки.

## 6. Вход в GitHub (ke)
Агенты работают через токен, у которого есть доступ **только к репозиторию KE**. Это меньше, чем полный доступ к аккаунту на старой рабочей станции.

1. В браузере: GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Token name: `ke-server`; Expiration: **90 days**. Поставь себе напоминание продлить токен.
   - Repository access: **Only select repositories → vmeaning/KE**.
   - Repository permissions:
     - **Read and write:** Contents, Issues, Pull requests, Workflows;
     - **Read-only:** Actions, Commit statuses (Metadata включится сам).
   - Нажми **Generate token** и скопируй токен.
2. На VM (ke):
```bash
read -rs GHT && echo "$GHT" | gh auth login --with-token && unset GHT
gh auth setup-git
```
После `read` вставь токен и нажми Enter. Токен не появится на экране и не попадёт в историю команд.

**Проверка:**
- `gh auth status` показывает `Logged in to github.com`;
- `gh issue list -R vmeaning/KE --state all` выводит Issue #5.

Если позже какая-то команда `gh` вернёт `403 Resource not accessible`, добавь токену право, названное в ошибке.

## 7. Claude Code (ke)
```bash
curl -fsSL https://claude.ai/install.sh | bash
exec bash -l
claude
```
При первом запуске выбери вход через подписку и войди с аккаунтом **Max**. Claude покажет ссылку: открой её на своём ПК, войди и вставь код обратно в терминал.

**Проверка:**
- `claude --version` показывает версию;
- в сессии `/status` показывает твой аккаунт и подписку. Выйди: `/exit`;
- `env | grep ANTHROPIC` **ничего не выводит**. Если там есть `ANTHROPIC_API_KEY`, Claude Code будет тратить API вместо подписки: удали переменную.

Токен для работы без браузера (`claude setup-token`) сейчас не нужен. Он понадобится для автономного режима (TEAM_PROCESS §12.5).

## 8. Репозиторий (ke)
```bash
gh repo clone vmeaning/KE ~/KE
cd ~/KE
npx -y playwright install chromium
node --test .claude/hooks/hooks.test.mjs
node --test scripts/status-guard.test.mjs
```
**Проверка:**
- в `~/KE` есть `CLAUDE.md` и папка `.claude`;
- оба прогона тестов заканчиваются строкой `# fail 0` (в первом `# pass 10`, во втором `# pass 14`).

## 9. Метки в GitHub (ke)
```bash
cd ~/KE && bash scripts/setup-labels.sh
```
**Проверка:** много строк `ok  …`, последняя — `ok  process-violation`.

## 10. Защита ветки `main` и настройки PR (в браузере)
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

## 11. Канбан-доска (в браузере, после merge PR с этой инструкцией)
Доска показывает задачи по колонкам статусов. Колонки обновляет Action «Status guard» по меткам `status:*` (§4.5 регламента). Сама доска ничего не решает: истина — метки на Issue.

1. GitHub → твой профиль → **Projects → New project → Board**. Название: `KE board`.
2. Поле **Status** (три точки у колонки → Edit field): сделай ровно семь вариантов — `Ready`, `In progress`, `Testing`, `Rework`, `Review`, `Blocked`, `Done`.
3. В настройках проекта (три точки → Settings) → **Manage access / Linked repositories** → свяжи с `vmeaning/KE`.
4. Номер проекта — число в адресе: `github.com/users/vmeaning/projects/<номер>`.
5. Токен для доски: **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**. Note: `ke-board`, Expiration: 90 days, scope — только **project**. Скопируй токен.
6. Репозиторий KE → **Settings → Secrets and variables → Actions**:
   - вкладка **Secrets** → New repository secret: имя `PROJECT_TOKEN`, значение — токен из п. 5;
   - вкладка **Variables** → New repository variable: имя `KE_PROJECT_NUMBER`, значение — номер из п. 4.

**Проверка:** поставь на Issue #5 метку `status:ready`. Примерно через минуту:
- карточка #5 стоит на доске в колонке **Ready**;
- в Actions → Status guard → последний запуск в логе есть строка `#5: board status → Ready`.

Если в логе ошибка доступа к проекту — пришли её в штаб: возможно, токену нужен ещё один scope.

## 12. Запуск штаба (ke)
Сессия штаба живёт в `tmux` и не обрывается, когда ты закрываешь SSH.
```bash
tmux new -s hq
cd ~/KE
claude --permission-mode acceptEdits
```
Первое сообщение в сессии: `/lead status`.

- Отключиться, не останавливая штаб: `Ctrl+B`, затем `D`. Вернуться: `ssh ke@<IP>`, затем `tmux attach -t hq`.
- **Из браузера или с телефона:** в отдельном окне tmux (`Ctrl+B`, затем `C`) выполни `cd ~/KE && claude remote-control`. Сессия появится в приложении Claude Code на claude.ai и в мобильном приложении.
- Режим `acceptEdits` разрешает агентам править файлы без подтверждения. Команды `git`, `gh`, `node`, `npm` разрешены в `.claude/settings.json`, остальное Claude спросит. Опасные действия (push в `main`, force-push, правку файлов процесса субагентами) блокируют hooks.
- Продолжить прошлую сессию: `claude --continue`. Новая сессия восстанавливает состояние по `/lead status`.

**Проверка:** `/lead status` отвечает сводкой по проекту.

## 13. Резервные копии
Всё состояние проекта живёт в GitHub. Поэтому копия VM нужна для быстрого восстановления среды и журнала расхода токенов `.claude/logs/`, которого нет в git.
- Включи у провайдера автоматические снапшоты или бэкапы **раз в неделю**.
- Если VM потеряна: создай новую по шагам 2–12 и продолжи с `/lead status`.

**Проверка:** в панели провайдера виден хотя бы один снапшот.

## 14. Перед фазой 0
- Увеличь VM до **4 vCPU, 16 ГБ RAM, 100 ГБ NVMe**.
- Если Архитектор в ADR выберет контейнеры для разработки или тестов, DevOps-задача фазы 0 добавит установку Docker в эту инструкцию.

**Проверка:** после перезагрузки `nproc` показывает `4`, а `free -h` — около 16Gi памяти.

## 15. Автономный режим (позже)
Запуск `/lead tick` по таймеру systemd настроим отдельной задачей после фазы 0 (TEAM_PROCESS §12.5). Сейчас ничего делать не нужно.
