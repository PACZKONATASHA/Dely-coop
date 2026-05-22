# Cómo arrancar Dely-Coop

## 1. Instalar dependencias (solo la primera vez)
```
cd server
npm install
```

## 2. Iniciar el servidor
```
cd server
node server.js
```

Abrí el navegador en **http://localhost:4000**

---

## Cuentas de prueba

| Rol        | Email                | Contraseña |
|------------|----------------------|------------|
| Comercio   | panaderia@sol.com    | 123456     |
| Repartidor | martin@courier.com   | 123456     |

---

## Endpoints disponibles

| Método | Ruta                          | Descripción                        |
|--------|-------------------------------|------------------------------------|
| POST   | /api/auth/login               | Iniciar sesión                     |
| POST   | /api/auth/register            | Registrar cuenta nueva             |
| GET    | /api/auth/me                  | Datos del usuario logueado         |
| GET    | /api/orders                   | Listar pedidos (comercio)          |
| POST   | /api/orders                   | Crear nuevo pedido                 |
| GET    | /api/orders/:id               | Detalle de un pedido               |
| PUT    | /api/orders/:id/cancel        | Cancelar pedido (comercio)         |
| GET    | /api/orders/available         | Pedidos disponibles (repartidor)   |
| GET    | /api/orders/my-deliveries     | Mis entregas (repartidor)          |
| PUT    | /api/orders/:id/accept        | Aceptar pedido (repartidor)        |
| PUT    | /api/orders/:id/pickup        | Confirmar retiro (repartidor)      |
| PUT    | /api/orders/:id/deliver       | Confirmar entrega (repartidor)     |
| GET    | /api/courier/stats            | Estadísticas del repartidor        |
| PUT    | /api/courier/availability     | Cambiar disponibilidad             |
| GET    | /api/courier/active-delivery  | Entrega activa actual              |
| GET    | /api/cooperative/news         | Noticias de la cooperativa         |
| GET    | /api/cooperative/stats        | Estadísticas de la cooperativa     |
