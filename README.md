## About Novus Ordo

The current runtime is the [indicator economy replacement](docs/game-design/indicator-economy-replacement-results.md): territorial conditions generate income, lasting capacity produces goods, and generic policies/resources remain game-owned. It replaces civilian cash/wage/profit accounting while retaining geography, seasonal history and Budget & Policies. **Fresh games are required; preserve saved maps when deleting disposable games through the admin lifecycle.**

Earlier production/civilian integration documents describe retired implementations. The pre-replacement source checkpoint is `d7604c5`.

Novus Ordo is an online strategy game. This repository contains its continuous development history.

The playable Version 7 checkpoint is preserved by the `v7.0.0` Git tag. Current development continues from that checkpoint toward Version 7.1, introducing the political system, microcell world model, revised economy and commerce incrementally.

Restoring an older release requires both its Git tag and a compatible database backup; source history does not replace database backups.

### Set up a development environment

#### Prerequisites
- MariaDB
- PHP, Composer, and the Laravel installer (see: https://laravel.com/docs/12.x/installation#creating-a-laravel-project)
- These packages must be installed along with PHP (when not using artisan's Web server): php-mysql php-cli php-mbstring php-xml php-bcmath php-tokenizer php-json php-curl  php-zip php-mysql libapache2-mod-php php-gd

#### Create the database
Log in as the MySQL/MariaDB DB adminstrator:
```bash
sudo mysql
```
Create the database and DB username and password (change the password at the very least!):
```sql
CREATE DATABASE novusordo;
GRANT ALL PRIVILEGES ON novusordo.* TO 'novusordo'@'localhost' IDENTIFIED BY 'nopassword';
GRANT ALL PRIVILEGES ON novusordo.* TO 'novusordo'@'%' IDENTIFIED BY 'nopassword'; # Allows remote access.
```

#### Clone the repository
```bash
git clone https://github.com/radiobuzz/novus-ordo-core.git
```

#### Change to the project's directory
```bash
cd novus-ordo-core
```

#### Configure the .env file
Copy the .env file:
```bash
cp .env.example .env
nano .env
```
You'll probably need to at least set the database name as well as DB username and password:
```
DB_DATABASE=novusordo
DB_USERNAME=novusordo
DB_PASSWORD=nopassword
```

#### Download vendor packages
```bash
composer install
```

#### Generate the application's encryption key
```bash
php artisan key:generate
```

#### Initialize the DB
```bash
php artisan migrate
```

#### Commission the new server
This creates an admin user with a random password (you should ideally customize the admin user's name). Sign in and create the first generated world from the administration Map workspace:
```bash
php artisan app:commission-server --admin-user=admin
```

#### Start the development server 
```bash
php artisan serve --host=192.168.0.2 # If you need to change the port, add e. g. --port=8000
```

### Provision a new admin user
If you ever lose the admin user's password, you can provision a new administrator from the command line:
```bash
php artisan app:provision-admin admin2
```
