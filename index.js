const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
require('dotenv').config()
const {ironSession} = require("iron-session/express");
const mongoose = require("mongoose");
const bodyParser = require('body-parser');
const expressRobotsTxt = require('express-robots-txt');

const User = require("./models/user");
const Order = require("./models/order");
const Product = require("./models/product");

const { Liquid } = require('liquidjs');
const engine = new Liquid();

app.use(expressRobotsTxt({UserAgent: '*', Disallow: '/'})); // Robots
app.use(bodyParser.json()); // Parsers
app.use(bodyParser.urlencoded({ extended: true}));
app.engine('liquid', engine.express()); 
app.set('views', './views');
app.set('view engine', 'liquid');

main().catch(err => console.log(err));
async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
}

const session = ironSession({
    password: process.env.SESSION_OPTION_PASSWORD,
    cookieName: process.env.SESSION_OPTION_COOKIE_NAME,
    ttl: 0,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
    },
});

const {getFullDate} = require('./utils/date');

app.get("/orders", session, async function (req, res, next) {
    if (!req.session.user) {
        throw("Auth error")
    }

    try {
        const user = await User.findById(req.session.user.id);
        if (!user) {
            throw("user not found");
        }
        if (!user.isAdmin) {
            throw("user does not have permissions");
        }

        const orders = [];
        const ordersFromDB = await Order.find({}, null, {skip: 0, limit: 35}).sort({_id: -1});
        for (let order of ordersFromDB) {
            const date = getFullDate(order.createdAt);
    
            const productIds = order.lineItems.map(i => i.productId);
            const products = await Product.find({'_id': {$in: productIds}});

            const lineItems = order.lineItems.map(item => {
              const product = products.find(p => p.id === String(item.productId));
              const images = product.images.map(img => ({
                src: img.src,
                srcWebp: img.srcWebp,
                width: img.width,
                height: img.height,
                alt: img.alt
              }));
    
              return {
                id: item.id,
                title: item.title,
                brand: item.brand,
                price: item.price,
                quantity: item.quantity,
                productId: item.productId,
                images,
                image: images.length ? images[0] : null
              };
            });
    
            orders.push({
              id: order.id,
              orderNumber: order.orderNumber,
              date,
              financialStatus: order.financialStatus,
              fulfillmentStatus: order.fulfillmentStatus,
              totalShippingPrice: order.totalShippingPrice,
              totalTax: order.totalTax,
              totalLineItemsPrice: order.totalLineItemsPrice, 
              totalDiscounts: order.totalDiscounts,
              subtotalPrice: order.subtotalPrice,
              totalPrice: order.totalPrice,
              lineItems,
            });
        }

        res.render('orders', {orders});
    } catch(e) {
        next(e);
    }
});

app.post("/orders", async function (req, res, next) {
    try {        
        if (!req.body.id) {
            throw('ID require');
        }

        const {id} = req.body;

        const order = await Order.findById(id);
        if (!order) {
            throw('Order not found');
        }

        const date = getFullDate(order.createdAt);
    
        const productIds = order.lineItems.map(i => i.productId);
        const products = await Product.find({'_id': {$in: productIds}});

        const lineItems = order.lineItems.map(item => {
          const product = products.find(p => p.id === String(item.productId));
          const images = product.images.map(img => ({
            src: img.src,
            srcWebp: img.srcWebp,
            width: img.width,
            height: img.height,
            alt: img.alt
          }));

          return {
            id: item.id,
            title: item.title,
            brand: item.brand,
            price: item.price,
            quantity: item.quantity,
            productId: item.productId,
            images,
            image: images.length ? images[0] : null
          };
        });

        const output = {
          id: order.id,
          orderNumber: order.orderNumber,
          date,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          totalShippingPrice: order.totalShippingPrice,
          totalTax: order.totalTax,
          totalLineItemsPrice: order.totalLineItemsPrice, 
          totalDiscounts: order.totalDiscounts,
          subtotalPrice: order.subtotalPrice,
          totalPrice: order.totalPrice,
          lineItems,
        };

        io.emit('orders', output);

        res.json({});
    } catch(e) {
        next(e);
    }
});

app.use((req, res, next) => {
    const err = new Error('Страница не найдена');
    err.status = 404;
    next(err);
});
app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.send(err.message || 'Internal Server Error');
});


io.on('connection', (socket) => {
    socket.on('chat message', msg => {
        console.log(msg)
        io.emit('chat message', msg);
    });
});

app.set('port', process.env.PORT);

server.listen(app.get('port'));