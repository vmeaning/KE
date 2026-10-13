# KE

Сервис управления конфигурационными единицами (CMDB) IT-службы. Работает on-prem, пользователи заходят через браузер, один код для серверов на Windows и Linux.

Проект ведёт команда ролей Claude под руководством владельца продукта:

- [docs/TEAM_PROCESS.md](docs/TEAM_PROCESS.md) — регламент: роли, цикл задачи, гейты, эскалации, метки;
- [docs/SETUP_SERVER.md](docs/SETUP_SERVER.md) — подготовка сервера команды (Linux-VM);
- [CLAUDE.md](CLAUDE.md) — общий контекст для всех ролей;
- `.claude/skills/`, `.claude/agents/` — инструкции ролей; `.claude/hooks/` — технические предохранители.

Начать работу: на сервере команды `claude --permission-mode acceptEdits` в папке репозитория, затем `/lead status`.
