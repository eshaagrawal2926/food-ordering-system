const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Data Stores (matching DFD Level 1 & Class Diagram)
let restaurants = [
  {
    restaurantId: 1,
    name: 'Bella Italia Trattoria',
    address: '42 Tuscany Way, Downtown',
    rating: 4.8,
    menu: [
      { itemId: 101, name: 'Margherita Pizza', price: 14.50, available: true },
      { itemId: 102, name: 'Truffle Pasta Carbonara', price: 18.00, available: true },
      { itemId: 103, name: 'Classic Tiramisu', price: 8.50, available: true }
    ]
  },
  {
    restaurantId: 2,
    name: 'Tokyo Express Ramen',
    address: '88 Sakura Blvd, Uptown',
    rating: 4.7,
    menu: [
      { itemId: 201, name: 'Tonkotsu Ramen Special', price: 15.50, available: true },
      { itemId: 202, name: 'Crispy Pork Gyoza (6 pcs)', price: 7.50, available: true },
      { itemId: 203, name: 'Matcha Iced Boba Tea', price: 5.00, available: true }
    ]
  }
];

let orders = [];
let reviews = [];
let nextOrderId = 1001;

// --- REST API ENDPOINTS ---

// 1. Browse Restaurants & Menus (Customer & Admin)
app.get('/api/restaurants', (req, res) => {
  res.json(restaurants);
});

// 2. Add / Update Menu Item (Restaurant Owner)
app.post('/api/restaurants/:id/menu', (req, res) => {
  const restId = parseInt(req.params.id);
  const { name, price } = req.body;
  const rest = restaurants.find(r => r.restaurantId === restId);
  if (!rest) return res.status(404).json({ error: 'Restaurant not found' });

  const newItem = {
    itemId: Date.now(),
    name,
    price: parseFloat(price),
    available: true
  };
  rest.menu.push(newItem);
  res.json(newItem);
});

// Toggle Item Availability (Restaurant Owner)
app.patch('/api/restaurants/:restId/menu/:itemId', (req, res) => {
  const restId = parseInt(req.params.restId);
  const itemId = parseInt(req.params.itemId);
  const rest = restaurants.find(r => r.restaurantId === restId);
  if (!rest) return res.status(404).json({ error: 'Restaurant not found' });

  const item = rest.menu.find(i => i.itemId === itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  item.available = req.body.available !== undefined ? req.body.available : !item.available;
  res.json(item);
});

// 3. Place Order & Mock Payment (Customer -> Payment Gateway -> Restaurant)
app.post('/api/orders', (req, res) => {
  const { customerName, address, items, restaurantId, paymentMethod, simulatePaymentFailure } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart cannot be empty' });
  }

  // Payment Gateway Verification
  if (simulatePaymentFailure) {
    return res.status(402).json({ error: 'Payment declined by gateway. Order cancelled.' });
  }

  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const newOrder = {
    orderId: nextOrderId++,
    orderDate: new Date().toISOString(),
    customerName: customerName || 'Alex Customer',
    deliveryAddress: address || '123 Main Street, Apt 4B',
    restaurantId: parseInt(restaurantId),
    items,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    payment: {
      paymentId: `PAY-${Date.now()}`,
      amount: parseFloat(totalAmount.toFixed(2)),
      method: paymentMethod || 'Credit Card',
      status: 'PAID'
    },
    // Lifecycle statuses: PENDING_ACCEPTANCE -> PREPARING -> READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED (or REJECTED)
    status: 'PENDING_ACCEPTANCE',
    deliveryPartner: null,
    rating: null
  };

  orders.unshift(newOrder);
  res.status(201).json(newOrder);
});

// 4. Get Orders (With optional status & role filtering)
app.get('/api/orders', (req, res) => {
  res.json(orders);
});

// 5. Restaurant Accept / Reject
app.patch('/api/orders/:id/decision', (req, res) => {
  const orderId = parseInt(req.params.id);
  const { decision } = req.body; // 'ACCEPT' or 'REJECT'
  const order = orders.find(o => o.orderId === orderId);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (decision === 'ACCEPT') {
    order.status = 'PREPARING';
  } else if (decision === 'REJECT') {
    order.status = 'REJECTED';
    order.payment.status = 'REFUNDED';
  } else if (decision === 'READY') {
    order.status = 'READY_FOR_PICKUP';
  }
  res.json(order);
});

// 6. Delivery Partner Actions: Accept Delivery & Update Status
app.patch('/api/orders/:id/delivery', (req, res) => {
  const orderId = parseInt(req.params.id);
  const { action, partnerName } = req.body;
  const order = orders.find(o => o.orderId === orderId);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (action === 'ACCEPT') {
    order.deliveryPartner = partnerName || 'FastRider Sam';
    order.status = 'OUT_FOR_DELIVERY';
  } else if (action === 'DELIVER') {
    order.status = 'DELIVERED';
    order.deliveredAt = new Date().toISOString();
  }
  res.json(order);
});

// 7. Rate & Review Order
app.post('/api/orders/:id/review', (req, res) => {
  const orderId = parseInt(req.params.id);
  const { rating, comment } = req.body;
  const order = orders.find(o => o.orderId === orderId);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.rating = parseInt(rating);
  order.reviewComment = comment;

  reviews.push({
    reviewId: Date.now(),
    orderId,
    restaurantId: order.restaurantId,
    rating: parseInt(rating),
    comment,
    date: new Date().toISOString()
  });

  res.json(order);
});

// 8. Admin Reports & Analytics
app.get('/api/admin/reports', (req, res) => {
  const totalRevenue = orders
    .filter(o => o.payment.status === 'PAID')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const statusCount = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    totalOrders: orders.length,
    totalRevenue: totalRevenue.toFixed(2),
    restaurantsCount: restaurants.length,
    statusBreakdown: statusCount
  });
});

app.listen(PORT, () => {
  console.log(`Food Ordering System running at: http://localhost:${PORT}`);
});

