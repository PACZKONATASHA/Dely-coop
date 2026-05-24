/* ── STATE ── */
let userRole     = 'commerce';
let history      = [];
let deliveryStep = 0;
let available    = true;
let currentOrderId = null;
let currentDeliveryId = null;

/* ── API ── */
const API = '/api';

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('user'); }
function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }
function setUser(u) { localStorage.setItem('user', JSON.stringify(u)); }

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}

/* ── NAVIGATION ── */
function goTo(id) {
  const current = document.querySelector('.screen.active');
  if (current) { history.push(current.id); current.classList.remove('active'); }
  document.getElementById(id).classList.add('active');
}
function goBack() {
  if (!history.length) return;
  document.querySelector('.screen.active')?.classList.remove('active');
  document.getElementById(history.pop()).classList.add('active');
}
function goToHome() {
  history = [];
  const role = getUser()?.role || userRole;
  goTo(role === 'commerce' ? 's-commerce-home' : 's-courier-home');
}

/* ── AUTH ── */
function selectRole(role) {
  userRole = role;
  document.getElementById('r-commerce').classList.toggle('active', role === 'commerce');
  document.getElementById('r-courier').classList.toggle('active',  role === 'courier');
}

async function doLogin() {
  const email    = document.querySelector('#s-login input[type=email]').value.trim();
  const password = document.querySelector('#s-login input[type=password]').value;
  if (!email || !password) { showToast('Completá todos los campos'); return; }
  try {
    const data = await api('POST', '/auth/login', { email, password, role: userRole });
    setToken(data.token);
    setUser(data.user);
    userRole = data.user.role;
    history = [];
    if (data.user.role === 'commerce') {
      loadCommerceHome();
      goTo('s-commerce-home');
    } else {
      loadCourierHome();
      goTo('s-courier-home');
    }
  } catch (e) { showToast('❌ ' + e.message); }
}

async function doRegister() {
  const name     = document.querySelector('#s-register .form-input[placeholder*="Nombre"]').value.trim();
  const email    = document.querySelector('#s-register input[type=email]').value.trim();
  const phone    = document.querySelector('#s-register input[type=tel]').value.trim();
  const password = document.querySelector('#s-register input[type=password]').value;
  const roleBtn  = document.querySelector('#s-register .role-btn.active');
  const role     = roleBtn?.textContent.includes('Repartidor') ? 'courier' : 'commerce';
  if (!name || !email || !password) { showToast('Completá todos los campos'); return; }
  try {
    const data = await api('POST', '/auth/register', { name, email, phone, password, role, business_name: name });
    setToken(data.token);
    setUser(data.user);
    userRole = data.user.role;
    history = [];
    showToast('✅ ¡Cuenta creada!');
    if (role === 'commerce') { loadCommerceHome(); goTo('s-commerce-home'); }
    else                     { loadCourierHome();  goTo('s-courier-home'); }
  } catch (e) { showToast('❌ ' + e.message); }
}

function setupRegisterRoles() {
  document.querySelectorAll('#s-register .role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#s-register .role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* ── COMMERCE HOME ── */
async function loadCommerceHome() {
  const user = getUser();
  if (user) {
    document.querySelector('#s-commerce-home .greeting').textContent = `Hola, ${user.name} 👋`;
  }
  try {
    const orders = await api('GET', '/orders');
    const list = document.querySelector('#s-commerce-home .scroll-content');
    const cards = list.querySelectorAll('.order-card');
    cards.forEach(c => c.remove());

    const recent = orders.slice(0, 3);
    const statusLabel = { transit: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado', pending: 'Buscando repartidor', assigned: 'Repartidor asignado' };
    const dotClass   = { transit: 'dot-transit', delivered: 'dot-delivered', cancelled: 'dot-cancelled', pending: 'dot-transit', assigned: 'dot-transit' };

    recent.forEach(o => {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.dataset.orderId = o.id;
      if (['transit','assigned','pending'].includes(o.status)) {
        card.addEventListener('click', () => { currentOrderId = o.id; loadTracking(o.id); goTo('s-tracking'); });
      }
      card.innerHTML = `
        <div class="status-dot ${dotClass[o.status] || 'dot-transit'}"></div>
        <div class="order-info"><div class="order-num">Pedido ${o.order_num}</div><div class="order-sub">${statusLabel[o.status]}</div></div>
        <div class="order-meta"><div class="order-time">${o.time || ''}</div><div class="order-cost">$${o.price}</div></div>
      `;
      list.insertBefore(card, list.querySelector('.nav-bar'));
    });
  } catch (e) { console.error(e); }
}

/* ── REQUEST DELIVERY ── */
async function doRequestDelivery() {
  const destination_address = document.querySelector('#s-request input[placeholder*="Calle"]').value.trim();
  const reference           = document.querySelector('#s-request input[placeholder*="Casa"]').value.trim();
  const observations        = document.querySelector('#s-request input[placeholder*="timbre"]').value.trim();
  const sizeSelect = document.querySelector('#s-request .form-select');
  const sizeText   = sizeSelect.options[sizeSelect.selectedIndex].text;
  const package_size = sizeText.split(' ')[0];

  if (!destination_address) { showToast('Ingresá la dirección de entrega'); return; }
  try {
    const order = await api('POST', '/orders', { destination_address, reference, observations, package_size });
    currentOrderId = order.id;
    document.querySelector('#s-confirmed .order-badge').textContent = `Pedido ${order.order_num}`;
    goTo('s-confirmed');
  } catch (e) { showToast('❌ ' + e.message); }
}

/* ── TRACKING ── */
async function loadTracking(orderId) {
  if (!orderId) return;
  try {
    const o = await api('GET', `/orders/${orderId}`);
    document.querySelector('#s-tracking .screen-title').textContent = 'Seguimiento del pedido';

    const subHeader = document.querySelector('#s-tracking > .scroll-content > div:first-child');
    if (subHeader) subHeader.textContent = `Pedido ${o.order_num}`;

    if (o.courier_name) {
      document.querySelector('.courier-name').textContent = o.courier_name;
      document.querySelector('.courier-rating').textContent = `⭐ ${o.courier_rating || '5.0'}`;
      const initials = o.courier_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      document.querySelector('.courier-avatar').textContent = initials;
    }

    const statusLabel = {
      created:   'Pedido recibido',
      assigned:  'Repartidor asignado',
      transit:   'En camino al destino',
      delivered: 'Entregado al cliente',
      cancelled: 'Pedido cancelado',
    };

    const statusOrder = ['created', 'assigned', 'transit', 'delivered'];
    const doneTypes = new Set(o.events?.map(e => e.event_type) || []);

    const timeline = document.querySelector('#s-tracking .timeline');
    if (timeline && o.events) {
      timeline.innerHTML = '';
      statusOrder.forEach(type => {
        const evt = o.events.find(e => e.event_type === type);
        const isDone = !!evt;
        const isCurrent = !isDone && statusOrder[statusOrder.indexOf(type) - 1] && doneTypes.has(statusOrder[statusOrder.indexOf(type) - 1]);
        const time = evt ? evt.created_at.slice(11, 16) : '—';
        let dotClass = isDone ? 'tl-done' : (isCurrent ? 'tl-current' : 'tl-pending');
        let dotContent = isDone ? '✓' : (isCurrent ? '●' : '○');
        timeline.innerHTML += `
          <div class="tl-item">
            <div class="tl-dot ${dotClass}">${dotContent}</div>
            <div><div class="tl-event${isDone || isCurrent ? '' : ' pending'}">${statusLabel[type]}</div><div class="tl-time">${time}</div></div>
          </div>`;
      });
    }
  } catch (e) { console.error(e); }
}

/* ── ORDERS LIST ── */
async function loadOrders(status = 'all') {
  try {
    const url = status === 'all' ? '/orders' : `/orders?status=${status}`;
    const orders = await api('GET', url);
    const list = document.getElementById('orders-list');
    list.innerHTML = '';
    const statusLabel = { transit: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado', pending: 'Buscando repartidor', assigned: 'Asignado' };
    const dotClass   = { transit: 'dot-transit', delivered: 'dot-delivered', cancelled: 'dot-cancelled', pending: 'dot-transit', assigned: 'dot-transit' };
    orders.forEach(o => {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.dataset.status = o.status === 'assigned' ? 'transit' : o.status;
      if (['transit','assigned','pending'].includes(o.status)) {
        card.addEventListener('click', () => { currentOrderId = o.id; loadTracking(o.id); goTo('s-tracking'); });
      }
      const costClass = o.status === 'cancelled' ? ' red' : '';
      card.innerHTML = `
        <div class="status-dot ${dotClass[o.status] || 'dot-transit'}"></div>
        <div class="order-info"><div class="order-num">Pedido ${o.order_num}</div><div class="order-sub">${statusLabel[o.status]}</div></div>
        <div class="order-meta"><div class="order-time">${o.time || ''}</div><div class="order-cost${costClass}">$${o.price}</div></div>
      `;
      list.appendChild(card);
    });
    if (!orders.length) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-light)">Sin pedidos</div>';
    }
  } catch (e) { showToast('❌ ' + e.message); }
}

function filterOrders(status, el) {
  document.querySelectorAll('#orders-tabs .tab-item').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const apiStatus = status === 'transit' ? 'transit' : status;
  loadOrders(apiStatus);
}

/* ── COURIER HOME ── */
async function loadCourierHome() {
  const user = getUser();
  if (user) {
    document.querySelector('#s-courier-home .greeting').textContent = `Hola, ${user.name} 👋`;
  }
  try {
    const stats = await api('GET', '/courier/stats');
    available = stats.available;
    const toggle = document.getElementById('avail-toggle');
    const label  = document.getElementById('avail-label');
    toggle.classList.toggle('on', available);
    label.textContent = available ? 'Disponible' : 'No disponible';

    document.querySelector('.balance-amt').textContent = `$${stats.balance.toLocaleString('es-AR')}`;
    const statVals = document.querySelectorAll('.stat-val');
    if (statVals[0]) statVals[0].textContent = stats.today_deliveries;
    if (statVals[1]) statVals[1].textContent = stats.week_deliveries;
    if (statVals[2]) statVals[2].textContent = stats.rating + '⭐';

    const available_orders = await api('GET', '/orders/available');
    const newOrderCard = document.querySelector('.new-order-card');
    if (available_orders.length > 0) {
      const o = available_orders[0];
      newOrderCard.querySelector('.new-order-name').textContent = o.commerce_name || 'Comercio';
      newOrderCard.querySelector('.new-order-addr').textContent = o.commerce_address || '';
      newOrderCard.querySelector('.pill:last-child').textContent = `💰 $${o.price}`;
      newOrderCard.dataset.orderId = o.id;
      newOrderCard.style.display = '';
    } else {
      newOrderCard.style.display = 'none';
    }

    const deliveries = await api('GET', '/orders/my-deliveries');
    const recentSection = document.querySelector('#s-courier-home .section-header.mt-14');
    if (recentSection) {
      let sibling = recentSection.nextElementSibling;
      while (sibling && !sibling.classList.contains('nav-bar')) {
        const next = sibling.nextElementSibling;
        sibling.remove();
        sibling = next;
      }
      const navBar = document.querySelector('#s-courier-home .nav-bar');
      deliveries.slice(0, 3).forEach(o => {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `
          <div class="status-dot dot-delivered"></div>
          <div class="order-info"><div class="order-num">Pedido ${o.order_num}</div><div class="order-sub">Entregado</div></div>
          <div class="order-meta"><div class="order-time">${o.time || ''}</div><div class="order-cost">$${o.price}</div></div>
        `;
        navBar.parentNode.insertBefore(card, navBar);
      });
    }
  } catch (e) { console.error(e); }
}

/* ── COURIER AVAILABILITY ── */
async function toggleAvailability() {
  available = !available;
  const toggle = document.getElementById('avail-toggle');
  const label  = document.getElementById('avail-label');
  toggle.classList.toggle('on', available);
  label.textContent = available ? 'Disponible' : 'No disponible';
  try {
    await api('PUT', '/courier/availability', { available });
  } catch (e) { showToast('❌ ' + e.message); }
}

/* ── ACCEPT ORDER (COURIER) ── */
async function acceptOrder() {
  const card = document.querySelector('.new-order-card');
  const orderId = card?.dataset.orderId;
  if (!orderId) return;
  try {
    await api('PUT', `/orders/${orderId}/accept`);
    currentDeliveryId = orderId;
    await loadActiveDelivery(orderId);
    goTo('s-active-delivery');
  } catch (e) { showToast('❌ ' + e.message); }
}

/* ── ACTIVE DELIVERY ── */
async function loadActiveDelivery(orderId) {
  if (!orderId) {
    try {
      const o = await api('GET', '/courier/active-delivery');
      if (!o) return;
      currentDeliveryId = o.id;
      fillActiveDelivery(o);
    } catch (e) { console.error(e); }
    return;
  }
  try {
    const o = await api('GET', `/orders/${orderId}`);
    fillActiveDelivery(o);
  } catch (e) { console.error(e); }
}

function fillActiveDelivery(o) {
  const pickupName = document.querySelector('.ds-pickup .ds-name');
  const pickupAddr = document.querySelector('.ds-pickup .ds-addr');
  const dropName   = document.querySelector('.ds-dropoff .ds-name');
  if (pickupName) pickupName.textContent = o.commerce_name || 'Comercio';
  if (pickupAddr) pickupAddr.textContent = o.commerce_address || '';
  if (dropName)   dropName.textContent   = o.destination_address;

  document.querySelector('.delivery-step-card:last-of-type .detail-row:nth-child(2) span:last-child')
    && (document.querySelectorAll('.detail-row')[1].querySelector('span:last-child').textContent = `Pedido ${o.order_num}`);

  deliveryStep = o.status === 'transit' ? 1 : 0;
  const btn = document.getElementById('delivery-action-btn');
  if (btn) {
    btn.textContent = deliveryStep === 1 ? 'Confirmar entrega' : 'Confirmar retiro';
    btn.style.background = deliveryStep === 1 ? 'var(--green-dark)' : '';
  }
  if (deliveryStep === 1) {
    const icon = document.querySelector('.ds-step-icon.pickup');
    if (icon) { icon.textContent = '✓'; icon.style.background = 'var(--green-btn)'; }
  }
}

/* ── DELIVERY PROGRESS ── */
async function advanceDelivery() {
  const btn = document.getElementById('delivery-action-btn');
  deliveryStep++;
  if (deliveryStep === 1) {
    btn.textContent = 'Confirmar entrega';
    btn.style.background = 'var(--green-dark)';
    const icon = document.querySelector('.ds-step-icon.pickup');
    if (icon) { icon.textContent = '✓'; icon.style.background = 'var(--green-btn)'; }
    try {
      await api('PUT', `/orders/${currentDeliveryId}/pickup`);
    } catch (e) { showToast('❌ ' + e.message); }
  } else {
    try {
      const result = await api('PUT', `/orders/${currentDeliveryId}/deliver`);
      deliveryStep = 0;
      btn.textContent = 'Confirmar retiro';
      btn.style.background = '';
      const icon = document.querySelector('.ds-step-icon.pickup');
      if (icon) { icon.textContent = '📍'; icon.style.background = ''; }
      showToast(`🎉 ¡Entrega completada! +$${result.earned} en tu balance`);
      await loadCourierHome();
      goTo('s-courier-home');
    } catch (e) { showToast('❌ ' + e.message); }
  }
}

/* ── LOGOUT ── */
function doLogout() {
  clearToken();
  history = [];
  userRole = 'commerce';
  currentOrderId = null;
  currentDeliveryId = null;
  goTo('s-landing');
}

/* ── TOAST ── */
function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: 'absolute', bottom: '100px', left: '20px', right: '20px',
    background: 'var(--green-dark)', color: '#fff', padding: '14px 18px',
    borderRadius: '14px', fontSize: '14px', fontWeight: '700',
    textAlign: 'center', zIndex: '999',
    animation: 'pop 0.3s ease', boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
  });
  document.querySelector('.phone').appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  setupRegisterRoles();

  document.querySelector('#s-register .btn.btn-primary')?.addEventListener('click', doRegister);

  document.getElementById('btn-request-delivery')?.addEventListener('click', doRequestDelivery);

  document.getElementById('btn-ver-estado')?.addEventListener('click', () => {
    if (currentOrderId) loadTracking(currentOrderId);
    goTo('s-tracking');
  });

  document.querySelector('.btn-accept')?.addEventListener('click', acceptOrder);

  // Auto-login si ya hay sesión guardada
  const token = getToken();
  const user  = getUser();
  if (token && user) {
    userRole = user.role;
    if (user.role === 'commerce') { loadCommerceHome(); goTo('s-commerce-home'); }
    else                          { loadCourierHome();  goTo('s-courier-home'); }
  }
});
