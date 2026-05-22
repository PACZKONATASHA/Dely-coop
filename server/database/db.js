const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'dely_coop.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('commerce','courier')),
    name TEXT NOT NULL,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS commerce_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    business_name TEXT NOT NULL,
    address TEXT
  );

  CREATE TABLE IF NOT EXISTS courier_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    rating REAL DEFAULT 5.0,
    total_deliveries INTEGER DEFAULT 0,
    available INTEGER DEFAULT 1,
    balance REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_num TEXT UNIQUE NOT NULL,
    commerce_id INTEGER NOT NULL REFERENCES users(id),
    courier_id INTEGER REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','assigned','transit','delivered','cancelled')),
    package_size TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    reference TEXT,
    observations TEXT,
    price REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cooperative_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT DEFAULT 'news',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

function dbDatetime(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function seed() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('panaderia@sol.com');
  if (existing) return;

  const hash1 = bcrypt.hashSync('123456', 10);
  const hash2 = bcrypt.hashSync('123456', 10);

  const commerceId = db.prepare(
    'INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)'
  ).run('panaderia@sol.com', hash1, 'commerce', 'Panadería Sol', '+54 376 111-2222').lastInsertRowid;

  db.prepare('INSERT INTO commerce_profiles (user_id, business_name, address) VALUES (?, ?, ?)')
    .run(commerceId, 'Panadería Sol', 'Calle Belgrano 459, Itu');

  const courierId = db.prepare(
    'INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)'
  ).run('martin@courier.com', hash2, 'courier', 'Martín López', '+54 376 333-4444').lastInsertRowid;

  db.prepare('INSERT INTO courier_profiles (user_id, rating, total_deliveries, balance) VALUES (?, ?, ?, ?)')
    .run(courierId, 4.9, 33, 12450);

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_num, commerce_id, courier_id, status, package_size,
      destination_address, reference, observations, price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(
    'INSERT INTO order_events (order_id, event_type, description, created_at) VALUES (?, ?, ?, ?)'
  );

  const o1 = insertOrder.run('#1025', commerceId, courierId, 'transit', 'Mediano',
    'Calle Falsa 123, Itu', 'Casa azul, portón negro', 'Tocar timbre', 450,
    dbDatetime(-25), dbDatetime(-20)).lastInsertRowid;
  insertEvent.run(o1, 'created',  'Pedido recibido',              dbDatetime(-25));
  insertEvent.run(o1, 'assigned', 'Repartidor asignado',          dbDatetime(-23));
  insertEvent.run(o1, 'transit',  'En camino a tu comercio',      dbDatetime(-20));

  const o2 = insertOrder.run('#1024', commerceId, courierId, 'delivered', 'Pequeño',
    'Av. San Martín 77, Itu', null, null, 300,
    dbDatetime(-80), dbDatetime(-55)).lastInsertRowid;
  insertEvent.run(o2, 'created',   'Pedido recibido',        dbDatetime(-80));
  insertEvent.run(o2, 'assigned',  'Repartidor asignado',    dbDatetime(-78));
  insertEvent.run(o2, 'transit',   'Pedido retirado',        dbDatetime(-70));
  insertEvent.run(o2, 'delivered', 'Entregado al cliente',   dbDatetime(-55));

  const o3 = insertOrder.run('#1023', commerceId, null, 'cancelled', 'Grande',
    'Ruta 14 km 3, Itu', null, null, 600,
    dbDatetime(-24 * 60 - 30), dbDatetime(-24 * 60 - 20)).lastInsertRowid;
  insertEvent.run(o3, 'created',   'Pedido recibido',    dbDatetime(-24 * 60 - 30));
  insertEvent.run(o3, 'cancelled', 'Pedido cancelado',   dbDatetime(-24 * 60 - 20));

  const o4 = insertOrder.run('#1022', commerceId, courierId, 'delivered', 'Mediano',
    'Lavalle 200, Itu', null, null, 450,
    dbDatetime(-23 * 60 - 20), dbDatetime(-23 * 60)).lastInsertRowid;
  insertEvent.run(o4, 'created',   'Pedido recibido',      dbDatetime(-23 * 60 - 20));
  insertEvent.run(o4, 'delivered', 'Entregado al cliente', dbDatetime(-23 * 60));

  const o5 = insertOrder.run('#1021', commerceId, courierId, 'delivered', 'Pequeño',
    'Mitre 55, Itu', null, null, 300,
    dbDatetime(-25 * 60 - 45), dbDatetime(-25 * 60 - 20)).lastInsertRowid;
  insertEvent.run(o5, 'created',   'Pedido recibido',      dbDatetime(-25 * 60 - 45));
  insertEvent.run(o5, 'delivered', 'Entregado al cliente', dbDatetime(-25 * 60 - 20));

  const newsItems = [
    ['Asamblea ordinaria: 28 de mayo', 'Recordamos a todos los socios que el próximo 28 de mayo a las 19hs se realizará la asamblea ordinaria mensual. Lugar: Sede cooperativa, Belgrano 500.', 'assembly'],
    ['Nuevos comercios adheridos', 'Esta semana se sumaron tres nuevos comercios socios: Almacén El Buen Gusto, Ferretería Norte y Farmacia del Pueblo.', 'news'],
    ['Actualización de tarifas', 'A partir del 1° de junio se actualizarán las tarifas base de los envíos. Consultá el documento en la sección Documentos.', 'news'],
  ];
  const insertNews = db.prepare('INSERT INTO cooperative_news (title, body, category) VALUES (?, ?, ?)');
  newsItems.forEach(([title, body, category]) => insertNews.run(title, body, category));
}

seed();

module.exports = db;
