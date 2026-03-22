# Hiking Telegram Bot

Telegram-бот для походів у гори. Бот може:

- консультувати по підготовці до хайкінгу;
- підказувати погоду для локації;
- шукати маршрути окремо від походу;
- вести походи учасників;
- призначати активний маршрут у межах походу;
- показувати hiking-маршрут через `openrouteservice foot-hiking` з fallback;
- мати локальну бібліотеку перевірених карпатських маршрутів для популярних напрямків;
- показувати elevation, мін/макс висоту і набір/скид по маршруту;
- давати посилання на карту маршруту;
- експортувати трек у GPX і KML;
- вести погоду в межах регіону походу;
- зберігати особисте спорядження користувача;
- збирати спільне спорядження походу;
- показувати, хто може поділитися спорядженням;
- фіксувати, кому в поході чого не вистачає;
- вести окрему картку походу з датами, ночівлями і статусом готовності спорядження.

## Логіка

- Загальний простір:
  погода, пошук маршрутів, поради, особисте спорядження.
- Простір походу:
  активний маршрут походу, дані походу, регіон погоди походу, спорядження походу, запити на спорядження.
- Обмеження:
  у користувача може бути лише один активний похід; завершений похід іде в історію, а не видаляється.
- Навігація:
  через нижнє меню і його підменю, без окремих inline-кнопок у повідомленнях.
- Майстри:
  пошук маршруту, маршрут походу і створення походу можна проходити покроково без ручного складання довгих команд.
- Маршрути:
  спочатку бот шукає маршрут у локальній бібліотеці перевірених походів; якщо збігу немає, тоді йде в hiking API (`openrouteservice`, `GraphHopper`), а вже потім у fallback.
  Бібліотека маршрутів винесена в `src/data/curatedRoutes.json`, тому її можна розширювати без змін у логіці сервісу.
- Збереження:
  основне сховище — MongoDB. Старий `store.json` може використовуватись тільки як одноразовий `MIGRATION_FILE` для імпорту на перший запуск.

## Основні команди

- `/start` - короткий вступ
- `/help` - список команд
- `/weather Місце` - загальний прогноз погоди
- `/route Звідки -> Куди` - окремий пошук маршруту
- `/addmygear назва;кількість;нотатка` - додати спорядження у власний профіль
- `/mygear` - переглянути власне спорядження
- `/advice сезон;дні;складність` - порада по підготовці

## Команди походу

- `/newgroup` - почати покрокове створення нового походу: назва, дата початку, дата завершення, автоматичний розрахунок ночівель
- `/join КодГрупи` - приєднатися до походу
- `/mygroup` - показати поточний похід
- `/setgrouproute Звідки -> Куди` - зберегти активний маршрут для походу
- `/editgrouproute Звідки -> Куди` - змінити вже існуючий маршрут походу
- `/grouproute` - переглянути активний маршрут походу
- `/setgroupregion Місце` - задати регіон погоди для походу
- `/groupweather` - погода для активного регіону походу
- `/finishtrip` - завершити активний похід і перенести його в історію
- `/grouphistory` - переглянути завершені походи
- `/addgear назва;кількість;shared|personal;так|ні` - додати спорядження саме в контекст поточного походу
- `/needgear назва;кількість;коментар` - вказати, якого спорядження не вистачає
- `/gear` - подивитися спорядження і потреби по походу
- `/requestgear назва` - знайти, хто може поділитися
- `/myneeds` - подивитися свої активні потреби

## Запуск

1. Встановити залежності:

```bash
npm install
```

2. Створити `.env` на базі `.env.example`

Для запуску потрібні:

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB=hiking_db
OPENROUTESERVICE_API_KEY=your_openrouteservice_key
```

Опційно для одноразового імпорту старих даних:

```env
MIGRATION_FILE=./data/store.json
```

3. Запустити бота:

```bash
npm run dev
```

## Що далі

- Для гірських маршрутів краще задавати не лише вершину, а й точні trailhead-точки, наприклад `Заросляк -> Говерла`.
- Додати ролі: організатор, учасник.
- Додати підтвердження передачі спорядження між учасниками.

## Автодеплой на свій ПК-сервер

Рекомендована схема:

- `main` → `prod`
- `develop` → `test`

У боті вже є окремі Mongo-колекції через `.env`:

- `APP_STAGE=prod` → `app_state_prod`
- `APP_STAGE=test` → `app_state_test`

### Що є в репозиторії

- GitHub Actions workflow: `.github/workflows/deploy.yml`
- PM2 config: `ecosystem.config.cjs`
- deploy scripts:
  - `scripts/deploy-prod.sh`
  - `scripts/deploy-test.sh`

### Що треба зробити на серверному ПК

1. Встановити Node.js, npm і pm2

```bash
npm install -g pm2
```

2. Поставити self-hosted runner для цього GitHub-репозиторію

3. Створити дві папки:

```bash
mkdir -p ~/services/hiking-telegram-bot-prod
mkdir -p ~/services/hiking-telegram-bot-test
```

4. Покласти окремий `.env` у кожну папку

Для `prod`:

- `APP_STAGE=prod`
- свій `BOT_TOKEN`
- свій `BOT_USERNAME`
- `MONGODB_COLLECTION_PROD=app_state_prod`

Для `test`:

- `APP_STAGE=test`
- інший `BOT_TOKEN`
- інший `BOT_USERNAME`
- `MONGODB_COLLECTION_TEST=app_state_test`

Важливо:

- для `prod` і `test` краще мати різні Telegram-боти
- не запускай два процеси з одним і тим самим `BOT_TOKEN`

5. Додати GitHub repository variables:

- `PROD_TARGET_DIR`
- `TEST_TARGET_DIR`

Наприклад:

- `PROD_TARGET_DIR=/Users/your-user/services/hiking-telegram-bot-prod`
- `TEST_TARGET_DIR=/Users/your-user/services/hiking-telegram-bot-test`

### Як це працює

- пуш у `main` запускає deploy у `prod`
- пуш у `develop` запускає deploy у `test`
- workflow копіює код у цільову папку
- запускає `npm ci --omit=dev`
- робить `pm2 startOrReload`
## vpohid archive sync

The bot keeps a local fallback archive for `vpohid.com.ua` routes in `data/vpohidArchive.json`.

- Manual refresh: `npm run sync:vpohid`
- Automatic refresh is enabled by default on bot startup

Env flags:

- `VPOHID_ARCHIVE_SYNC_ENABLED=true`
- `VPOHID_ARCHIVE_SYNC_HOURS=24`
- `VPOHID_ARCHIVE_SYNC_STARTUP_DELAY_MINUTES=3`
