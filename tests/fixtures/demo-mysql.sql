-- Demo schema for MiB-Crude tests (MariaDB/MySQL)
DROP TABLE IF EXISTS order_items, orders, customers, cities, countries, products, categories, mc_users, mc_groups, mc_members, mc_rights, mc_audit, mc_locks;
CREATE TABLE categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT);
CREATE TABLE products (id INT AUTO_INCREMENT PRIMARY KEY, category_id INT NOT NULL, name VARCHAR(150) NOT NULL, price DECIMAL(10,2) NOT NULL DEFAULT 0,
  in_stock TINYINT(1) NOT NULL DEFAULT 1, photo VARCHAR(500), created_at DATETIME, FOREIGN KEY (category_id) REFERENCES categories(id));
CREATE TABLE countries (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL);
CREATE TABLE cities (id INT AUTO_INCREMENT PRIMARY KEY, country_id INT NOT NULL, name VARCHAR(100) NOT NULL, FOREIGN KEY (country_id) REFERENCES countries(id));
CREATE TABLE customers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, email VARCHAR(200), country_id INT, city_id INT, notes TEXT,
  FOREIGN KEY (country_id) REFERENCES countries(id), FOREIGN KEY (city_id) REFERENCES cities(id));
CREATE TABLE orders (id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, order_date DATE NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'new', total DECIMAL(10,2) DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers(id));
CREATE TABLE order_items (id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL, product_id INT NOT NULL, qty INT NOT NULL DEFAULT 1, price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id));
INSERT INTO categories (name, description) VALUES ('Libri','Carta e ebook'),('Elettronica','Gadget'),('Casa','Arredo');
INSERT INTO products (category_id, name, price, in_stock, created_at) VALUES (1,'Il nome della rosa',12.50,1,NOW()),(1,'Gomorra',11.00,1,NOW()),(2,'Cuffie BT',59.90,1,NOW()),(2,'Mouse',19.99,0,NOW()),(3,'Lampada',35.00,1,NOW());
INSERT INTO countries (name) VALUES ('Italia'),('Francia');
INSERT INTO cities (country_id, name) VALUES (1,'Roma'),(1,'Milano'),(2,'Parigi'),(2,'Lione');
INSERT INTO customers (name, email, country_id, city_id) VALUES ('Mario Rossi','mario@example.com',1,1),('Anna Bianchi','anna@example.com',1,2),('Jean Dupont','jean@example.fr',2,3);
INSERT INTO orders (customer_id, order_date, status, total) VALUES (1,'2026-09-01','new',24.50),(1,'2026-10-02','shipped',59.90),(2,'2026-10-15','new',35.00),(3,'2026-10-20','closed',19.99);
INSERT INTO order_items (order_id, product_id, qty, price) VALUES (1,1,1,12.50),(1,2,1,11.00),(2,3,1,59.90),(3,5,1,35.00),(4,4,1,19.99);
