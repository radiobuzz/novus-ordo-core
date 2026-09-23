## About Novus Ordo Core

Novus Ordo Core is a rationalization effort of earlier reboot attempts of the Novus Ordo online strategy game.

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
This will create an admin user with a random password and start a new game (you should ideally customize the admin user's name):
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
